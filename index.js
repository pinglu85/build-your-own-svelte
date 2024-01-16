import * as fs from 'fs';
import * as acorn from 'acorn';
import * as periscopic from 'periscopic';
import * as estreeWalker from 'estree-walker';
import * as escodegen from 'escodegen';

const content = fs.readFileSync('./app.svelte', 'utf-8');
const ast = parse(content);
const analysis = analyze(ast);

fs.writeFileSync('./ssr.js', generateSSR(ast, analysis), 'utf-8');
fs.writeFileSync('./app.js', generate(ast, analysis), 'utf-8');

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
    reactiveDeclarations: [],
  };

  const { scope: rootScope, map } = periscopic.analyze(ast.script);
  result.variables = new Set(rootScope.declarations.keys());
  result.rootScope = rootScope;
  result.map = map;

  const toRemoves = new Set();

  ast.script.body.forEach((node, index) => {
    if (node.type === 'LabeledStatement' && node.label.name === '$') {
      toRemoves.add(node);

      const { body } = node;
      // For now we assume reactive declarations are assignment expressions.
      const { left, right } = body.expression;
      result.willChange.add(left.name);

      const dependencies = [];
      estreeWalker.walk(right, {
        enter(node) {
          if (node.type === 'Identifier') dependencies.push(node.name);
        },
      });

      const reactiveDeclaration = {
        assignees: [left.name],
        dependencies,
        node: body,
        index,
      };

      result.reactiveDeclarations.push(reactiveDeclaration);
    }
  });
  ast.script.body = ast.script.body.filter((node) => !toRemoves.has(node));

  let currentScope = rootScope;
  estreeWalker.walk(ast.script, {
    enter(node) {
      if (map.has(node)) currentScope = map.get(node);

      // See: https://astexplorer.net/#/gist/3b92b78c2759ff9bd3984b2c552c2628/latest
      // We mark the variable as 'willChange' only if it is declared in the root
      // scope.
      if (
        node.type === 'UpdateExpression' ||
        node.type === 'AssignmentExpression'
      ) {
        const names = periscopic.extract_names(
          node.type === 'UpdateExpression' ? node.argument : node.left
        );

        for (const name of names) {
          if (currentScope.find_owner(name) === rootScope) {
            result.willChange.add(name);
          }
        }
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
        extractNames(fragment.expression).forEach((name) => {
          result.willUseInTemplate.add(name);
        });
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
    reactiveDecorations: [],
  };

  let counter = 1;
  let hydrationIndex = 0;
  let hydrationParent = 'target';

  function traverse(node, parent) {
    switch (node.type) {
      case 'Element': {
        const variableName = `${node.name}_${counter++}`;

        code.variables.push(variableName);

        code.create.push(
          `${variableName} = shouldHydrate ? ${hydrationParent}.childNodes[${hydrationIndex++}] : document.createElement('${
            node.name
          }')`
        );

        node.attributes.forEach((attribute) => {
          traverse(attribute, variableName);
        });

        const currentHydrationParent = hydrationParent;
        const currentHydrationIndex = hydrationIndex;
        hydrationParent = variableName;
        hydrationIndex = 0;

        node.children.forEach((child) => {
          traverse(child, variableName);
        });

        hydrationParent = currentHydrationParent;
        hydrationIndex = currentHydrationIndex;

        code.create.push(
          `if (!shouldHydrate) ${parent}.appendChild(${variableName})`
        );
        code.destroy.push(`${parent}.removeChild(${variableName})`);
        break;
      }

      case 'Text': {
        const variableName = `txt_${counter++}`;

        code.variables.push(variableName);

        code.create.push(
          `${variableName} = shouldHydrate ? ${hydrationParent}.childNodes[${hydrationIndex++}] : document.createTextNode('${
            node.value
          }')`
        );
        // Skip forward for the comment node.
        hydrationIndex++;

        code.create.push(
          `if (!shouldHydrate) ${parent}.appendChild(${variableName})`
        );
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
        // Use `escodegen` to convert Binary Expression into string.
        const expressionStr = escodegen.generate(node.expression);

        code.variables.push(variableName);

        code.create.push(
          `${variableName} = shouldHydrate ? ${hydrationParent}.childNodes[${hydrationIndex++}] : document.createTextNode(${expressionStr})`
        );
        // Skip forward for the comment node.
        hydrationIndex++;

        code.create.push(
          `if (!shouldHydrate) ${parent}.appendChild(${variableName})`
        );

        const changes = new Set();
        extractNames(node.expression).forEach((name) => {
          if (analysis.willChange.has(name)) changes.add(name);
        });

        if (changes.size > 1) {
          code.update.push(`if (${JSON.stringify([
            ...changes,
          ])}.some(name => changed.includes(name))) {
            ${variableName}.data = ${expressionStr};
          }`);
        } else if (changes.size === 1) {
          code.update.push(`if (changed.includes('${[...changes][0]}')) {
            ${variableName}.data = ${expressionStr};
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
        node.type === 'UpdateExpression' ||
        node.type === 'AssignmentExpression'
      ) {
        const names = periscopic
          .extract_names(
            node.type === 'UpdateExpression' ? node.argument : node.left
          )
          .filter(
            (name) =>
              currentScope.find_owner(name) === rootScope &&
              analysis.willUseInTemplate.has(name)
          );

        if (names.length > 0) {
          this.replace({
            type: 'SequenceExpression',
            expressions: [
              node,
              acorn.parseExpressionAt(`update(${JSON.stringify(names)})`, 0, {
                ecmaVersion: 2022,
              }),
            ],
          });
          this.skip();
        }
      }
    },

    leave(node) {
      if (map.has(node)) currentScope = currentScope.parent;
    },
  });

  analysis.reactiveDeclarations.sort((rd1, rd2) => {
    // rd2 depends on rd1, then rd2 should come after rd2.
    if (rd1.assignees.some((assignee) => rd2.dependencies.includes(assignee))) {
      return -1;
    }

    // rd1 depends on rd2, then rd1 should come after rd2.
    if (rd2.assignees.some((assignee) => rd1.dependencies.includes(assignee))) {
      return 1;
    }

    // Based on original order.
    return rd1.index - rd2.index;
  });

  analysis.reactiveDeclarations.forEach(({ node, assignees, dependencies }) => {
    code.reactiveDecorations.push(`
        if (${JSON.stringify(
          dependencies
        )}.some((name) => changed.includes(name))) {
          ${escodegen.generate(node)}
          update(${JSON.stringify(assignees)});
        }
      `);

    assignees.forEach((assignee) => {
      code.variables.push(assignee);
    });
  });

  // We use `escodegen.generate()` to add code in `<script>` block to the
  // function.
  return `
    export default function() {
      ${escodegen.generate(ast.script)}
      ${code.variables.map((v) => `let ${v};`).join('\n')}
   
      let isMounted = false;

      const lifeCycle = {
        create(target) {
          const shouldHydrate = target.childNodes.length > 0;

          ${code.create.join('\n')}

          isMounted = true;
        }, 
        update(changed) {
          ${code.update.join('\n')}
        },
        destroy(target) {
          ${code.destroy.join('\n')}

          isMounted = false;
        }
      }

      let collectChanges = [];
      let updateCalled = false;

      function update(changed) {
        changed.forEach((change) => {
          collectChanges.push(change);
        });

        if (updateCalled) return;

        updateCalled = true;

        // Call once
        updateReactiveDeclarations(collectChanges);
        if (isMounted) lifeCycle.update(collectChanges);
        updateCalled = false;
        collectChanges = [];
      }

      update(${JSON.stringify([...analysis.willChange])});

      function updateReactiveDeclarations(changed) {
        ${code.reactiveDecorations.join('\n')}
      }

      return lifeCycle;
    }
  `;
}

function generateSSR(ast, analysis) {
  const code = {
    variables: [],
    reactiveDecorations: [],
    template: {
      expressions: [],
      quasis: [],
    },
  };

  let templateStringArr = [];
  function addString(str) {
    templateStringArr.push(str);
  }

  function addExpressions(expression) {
    code.template.quasis.push(templateStringArr.join(''));
    templateStringArr = [];
    code.template.expressions.push(expression);
  }

  function traverse(node) {
    switch (node.type) {
      case 'Element': {
        addString(`<${node.name}`);

        node.attributes.forEach((attribute) => {
          traverse(attribute);
        });
        addString('>');

        node.children.forEach((child) => {
          traverse(child);
        });
        addString(`</${node.name}>`);

        break;
      }

      case 'Text': {
        addString(node.value);
        // Use comment to break up a text node into multiple smaller text nodes for hydration.
        //
        // For instance, the SSR output of `<div>{counter} * 2 = {double}</div>` will be
        // `<div>${counter} * 2 = ${double}</div>` and the browser will receive something like
        // `<div>5 * 2 = 10<div>`. From the perspective of the browser, `5 * 2 = 10` is just
        // one text, so it only creates one text node. In the client side, however, we're
        // creating three nodes. As a result, when we want to reuse the text nodes during hydration,
        // the other two text nodes will be `undefined`.
        addString('<!---->');
        break;
      }

      case 'Attribute': {
        // addString(' class="element"');
        break;
      }

      case 'Expression': {
        addExpressions(node.expression);
        addString('<!---->');
      }
    }
  }

  ast.html.forEach((fragment) => {
    traverse(fragment);
  });

  if (templateStringArr.length > 0) {
    code.template.quasis.push(templateStringArr.join(''));
  }

  analysis.reactiveDeclarations.sort((rd1, rd2) => {
    // rd2 depends on rd1, then rd2 should come after rd2.
    if (rd1.assignees.some((assignee) => rd2.dependencies.includes(assignee))) {
      return -1;
    }

    // rd1 depends on rd2, then rd1 should come after rd2.
    if (rd2.assignees.some((assignee) => rd1.dependencies.includes(assignee))) {
      return 1;
    }

    // Based on original order.
    return rd1.index - rd2.index;
  });

  analysis.reactiveDeclarations.forEach(({ node, assignees }) => {
    code.reactiveDecorations.push(escodegen.generate(node));

    assignees.forEach((assignee) => {
      code.variables.push(assignee);
    });
  });

  const templateLiteral = {
    type: 'TemplateLiteral',
    expressions: code.template.expressions,
    quasis: code.template.quasis.map((str) => ({
      type: 'TemplateElement',
      value: {
        raw: str,
        cooked: str,
      },
    })),
  };

  return `
    export default function() {
      ${escodegen.generate(ast.script)}
      ${code.variables.map((v) => `let ${v};`).join('\n')}
  
      ${code.reactiveDecorations.join('\n')}

      return ${escodegen.generate(templateLiteral)};
    }
  `;
}

function extractNames(jsNode, result = []) {
  switch (jsNode.type) {
    case 'Identifier':
      result.push(jsNode.name);
      break;
    case 'BinaryExpression':
      extractNames(jsNode.left, result);
      extractNames(jsNode.right, result);
      break;
    case 'CallExpression':
      for (const argument of jsNode.arguments) {
        extractNames(argument, result);
      }
      break;
    default:
    // do nothing
  }

  return result;
}
