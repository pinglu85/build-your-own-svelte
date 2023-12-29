import * as fs from 'fs';
import * as acorn from 'acorn';
import * as periscopic from 'periscopic';
import * as estreeWalker from 'estree-walker';
import * as escodegen from 'escodegen';

const content = fs.readFileSync('./app.svelte', 'utf-8');
const ast = parse(content);
const analysis = analyze(ast);
const js = generate(ast, analysis);

// console.log(analysis);
// fs.writeFileSync('./app.json', JSON.stringify(ast, null, 2), 'utf-8');
fs.writeFileSync('./app.js', js, 'utf-8');

/**
 * Svelte Syntax
 *
 * <fragments> ::= <fragment> | <fragments> <fragment>
 * <fragment> ::= <script> | <element> | <expression> | <text>
 * <script> ::= "<script>" <javascript> "</script>"
 * <element> ::= "<" <tag-name> <attribute-list> ">" <fragments> "</" <tag-name> ">"
 * <attribute-list> ::= | <space> <attribute> | <attribute-list> <space> <attribute>
 * <attribute> ::= <attribute-name> "={" <javascript> "}"
 * <expression> ::= "{" <javascript> "}"
 */

function parse(content) {
  let i = 0;
  const ast = {};
  ast.html = parseFragments(() => i < content.length);

  return ast;

  function parseFragments(condition) {
    const fragments = [];

    while (condition()) {
      const fragment = parseFragment();
      if (fragment) fragments.push(fragment);
    }

    return fragments;
  }

  function parseFragment() {
    return parseScript() ?? parseElement() ?? parseExpression() ?? parseText();
  }

  function parseScript() {
    if (match('<script>')) {
      eat('<script>');

      const startIndex = i;
      const endIndex = content.indexOf('</script>', i);
      const code = content.slice(startIndex, endIndex);
      ast.script = acorn.parse(code, { ecmaVersion: 2022 });

      i = endIndex;
      eat('</script>');
    }
  }

  function parseElement() {
    if (match('<')) {
      eat('<');

      const tagName = readWhileWatching(/[a-z]/);
      const attributes = parseAttributeList();

      eat('>');

      const endTag = `</${tagName}>`;
      const element = {
        type: 'Element',
        name: tagName,
        attributes,
        children: parseFragments(() => !match(endTag)),
      };

      eat(endTag);
      return element;
    }
  }

  function parseAttributeList() {
    const attributes = [];
    skipWhiteSpace();

    while (!match('>')) {
      attributes.push(parseAttribute());
      skipWhiteSpace();
    }

    return attributes;
  }

  function parseAttribute() {
    const name = readWhileWatching(/[^=]/);
    eat('={');

    const value = parseJavaScript();

    eat('}');
    return {
      type: 'Attribute',
      name,
      value,
    };
  }

  function parseExpression() {
    if (match('{')) {
      eat('{');

      const expression = parseJavaScript();

      eat('}');
      return {
        type: 'Expression',
        expression,
      };
    }
  }

  function parseText() {
    const text = readWhileWatching(/[^<{]/);

    // To make things simple, we are not going to create text nodes
    // for plain white spaces.
    if (text.trim() !== '') {
      return {
        type: 'Text',
        value: text,
      };
    }
  }

  function parseJavaScript() {
    const js = acorn.parseExpressionAt(content, i, { ecmaVersion: 2022 });
    i = js.end;
    return js;
  }

  function match(str) {
    return content.slice(i, i + str.length) === str;
  }

  function eat(str) {
    if (match(str)) {
      i += str.length;
    } else {
      throw new Error(`Parse error: expecting "${str}"`);
    }
  }

  function readWhileWatching(regex) {
    let startIndex = i;

    while (i < content.length && regex.test(content[i])) {
      i++;
    }

    return content.slice(startIndex, i);
  }

  function skipWhiteSpace() {
    readWhileWatching(/[\s\n]/);
  }
}

function analyze(ast) {
  const result = {
    variables: new Set(),
    willChange: new Set(),
    willUseInTemplate: new Set(),
  };

  const { scope: rootScope, map } = periscopic.analyze(ast.script);
  result.variables = new Set(rootScope.declarations.keys());
  result.rootScope = rootScope;
  result.map = map;

  let currentScope = rootScope;
  estreeWalker.walk(ast.script, {
    enter(node) {
      if (map.has(node)) currentScope = map.get(node);

      // See: https://astexplorer.net/#/gist/3b92b78c2759ff9bd3984b2c552c2628/latest
      // We mark the variable as 'willChange' only if it is declared in the root
      // scope.
      if (
        node.type === 'UpdateExpression' &&
        currentScope.find_owner(node.argument.name) === rootScope
      ) {
        result.willChange.add(node.argument.name);
      }
    },

    leave(node) {
      if (map.has(node)) currentScope = currentScope.parent;
    },
  });

  ast.html.forEach((fragment) => {
    traverse(fragment);
  });

  function traverse(fragment) {
    switch (fragment.type) {
      case 'Element':
        fragment.children.forEach((child) => {
          traverse(child);
        });
        fragment.attributes.forEach((attribute) => {
          traverse(attribute);
        });
        break;
      case 'Attribute':
        // We assume it is a normal variable, not a member expression, i.e
        // `a.b`. If this is the case, we cannot get the name directly, we
        // have to traverse the JavaScript AST to get the name of`b`.
        result.willUseInTemplate.add(fragment.value.name);
        break;
      case 'Expression':
        // We assume it is a normal variable, not a member expression, i.e
        // a.b
        result.willUseInTemplate.add(fragment.expression.name);
        break;
      default:
      // do nothing
    }
  }

  return result;
}

function generate(ast, analysis) {
  const code = {
    variables: [],
    create: [],
    update: [],
    destroy: [],
  };

  let counter = 1;

  function traverse(node, parent) {
    switch (node.type) {
      case 'Element': {
        const variableName = `${node.name}_${counter++}`;

        code.variables.push(variableName);

        code.create.push(
          `${variableName} = document.createElement('${node.name}')`
        );

        node.attributes.forEach((attribute) => {
          traverse(attribute, variableName);
        });
        node.children.forEach((child) => {
          traverse(child, variableName);
        });

        code.create.push(`${parent}.appendChild(${variableName})`);
        code.destroy.push(`${parent}.removeChild(${variableName})`);
        break;
      }

      case 'Text': {
        const variableName = `txt_${counter++}`;

        code.variables.push(variableName);

        code.create.push(
          `${variableName} = document.createTextNode('${node.value}')`
        );

        code.create.push(`${parent}.appendChild(${variableName})`);
        break;
      }

      case 'Attribute': {
        if (node.name.startsWith('on:')) {
          const eventName = node.name.slice(3);
          const eventHandler = node.value.name;

          code.create.push(
            `${parent}.addEventListener('${eventName}', ${eventHandler})`
          );

          code.destroy.push(
            `${parent}.removeEventListener('${eventName}', ${eventHandler})`
          );
        }
        break;
      }

      case 'Expression': {
        const variableName = `txt_${counter++}`;
        const expression = node.expression.name;

        code.variables.push(variableName);

        code.create.push(
          `${variableName} = document.createTextNode(${expression})`
        );

        code.create.push(`${parent}.appendChild(${variableName})`);

        if (analysis.willChange.has(expression)) {
          code.update.push(`if (changed.includes('${expression}')) {
            ${variableName}.data = ${expression};
          }`);
        }
      }
    }
  }

  ast.html.forEach((fragment) => {
    traverse(fragment, 'target');
  });

  // Make the variable that is used in template reactive.
  // For instance, `const increment = () => counter++;`
  // will become:
  //   `const increment = () => (counter++, lifeCycle.update(['counter']));`
  const { rootScope, map } = analysis;
  let currentScope = rootScope;
  estreeWalker.walk(ast.script, {
    enter(node) {
      if (map.has(node)) currentScope = map.get(node);

      if (
        node.type === 'UpdateExpression' &&
        currentScope.find_owner(node.argument.name) === rootScope &&
        analysis.willUseInTemplate.has(node.argument.name)
      ) {
        this.replace({
          type: 'SequenceExpression',
          expressions: [
            node,
            acorn.parseExpressionAt(
              `lifeCycle.update(['${node.argument.name}'])`,
              0,
              {
                ecmaVersion: 2022,
              }
            ),
          ],
        });
        this.skip();
      }
    },

    leave(node) {
      if (map.has(node)) currentScope = currentScope.parent;
    },
  });

  // We use `escodegen.generate()` to add code in `<script>` block to the
  // function.
  return `
    export default function() {
      ${escodegen.generate(ast.script)}
      ${code.variables.map((v) => `let ${v};`).join('\n')}
   
      const lifeCycle = {
        create(target) {
          ${code.create.join('\n')}
        }, 
        update(changed) {
          ${code.update.join('\n')}
        },
        destroy(target) {
          ${code.destroy.join('\n')}
        }
      }

      return lifeCycle;
    }
  `;
}
