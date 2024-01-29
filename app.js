export default function ({ restoredState } = {}) {
  let counter = restoredState?.counter ?? 5;
  let foo = restoredState?.foo ?? 5;
  const increment = () => (counter++, update(['counter']));
  const decrement = () => (counter--, update(['counter']));
  const incrementFoo = () => (foo++, update(['foo']));
  let button_1;
  let txt_2;
  let div_3;
  let txt_4;
  let txt_5;
  let txt_6;
  let div_7;
  let txt_8;
  let txt_9;
  let txt_10;
  let div_11;
  let txt_12;
  let txt_13;
  let button_14;
  let txt_15;
  let button_16;
  let txt_17;
  let bar;
  let double;
  let quadruple;

  let isMounted = false;

  const lifeCycle = {
    create(target, shouldHydrate = target.childNodes.length > 0) {
      button_1 = shouldHydrate
        ? target.childNodes[0]
        : document.createElement('button');
      button_1.addEventListener('click', decrement);
      txt_2 = shouldHydrate
        ? button_1.childNodes[0]
        : document.createTextNode('Decrement');
      if (!shouldHydrate) button_1.appendChild(txt_2);
      if (!shouldHydrate) target.appendChild(button_1);
      div_3 = shouldHydrate
        ? target.childNodes[1]
        : document.createElement('div');
      txt_4 = shouldHydrate
        ? div_3.childNodes[0]
        : document.createTextNode(counter);
      if (!shouldHydrate) div_3.appendChild(txt_4);
      txt_5 = shouldHydrate
        ? div_3.childNodes[2]
        : document.createTextNode(' * 2 = ');
      if (!shouldHydrate) div_3.appendChild(txt_5);
      txt_6 = shouldHydrate
        ? div_3.childNodes[4]
        : document.createTextNode(double);
      if (!shouldHydrate) div_3.appendChild(txt_6);
      if (!shouldHydrate) target.appendChild(div_3);
      div_7 = shouldHydrate
        ? target.childNodes[2]
        : document.createElement('div');
      txt_8 = shouldHydrate
        ? div_7.childNodes[0]
        : document.createTextNode(double);
      if (!shouldHydrate) div_7.appendChild(txt_8);
      txt_9 = shouldHydrate
        ? div_7.childNodes[2]
        : document.createTextNode(' * 2 = ');
      if (!shouldHydrate) div_7.appendChild(txt_9);
      txt_10 = shouldHydrate
        ? div_7.childNodes[4]
        : document.createTextNode(quadruple);
      if (!shouldHydrate) div_7.appendChild(txt_10);
      if (!shouldHydrate) target.appendChild(div_7);
      div_11 = shouldHydrate
        ? target.childNodes[3]
        : document.createElement('div');
      txt_12 = shouldHydrate
        ? div_11.childNodes[0]
        : document.createTextNode('foo = ');
      if (!shouldHydrate) div_11.appendChild(txt_12);
      txt_13 = shouldHydrate
        ? div_11.childNodes[2]
        : document.createTextNode(foo);
      if (!shouldHydrate) div_11.appendChild(txt_13);
      if (!shouldHydrate) target.appendChild(div_11);
      button_14 = shouldHydrate
        ? target.childNodes[4]
        : document.createElement('button');
      button_14.addEventListener('click', increment);
      txt_15 = shouldHydrate
        ? button_14.childNodes[0]
        : document.createTextNode('Increment');
      if (!shouldHydrate) button_14.appendChild(txt_15);
      if (!shouldHydrate) target.appendChild(button_14);
      button_16 = shouldHydrate
        ? target.childNodes[5]
        : document.createElement('button');
      button_16.addEventListener('click', incrementFoo);
      txt_17 = shouldHydrate
        ? button_16.childNodes[0]
        : document.createTextNode('Increment Foo');
      if (!shouldHydrate) button_16.appendChild(txt_17);
      if (!shouldHydrate) target.appendChild(button_16);

      isMounted = true;
    },
    update(changed) {
      if (changed.includes('counter')) {
        txt_4.data = counter;
      }
      if (changed.includes('double')) {
        txt_6.data = double;
      }
      if (changed.includes('double')) {
        txt_8.data = double;
      }
      if (changed.includes('quadruple')) {
        txt_10.data = quadruple;
      }
      if (changed.includes('foo')) {
        txt_13.data = foo;
      }
    },
    destroy(target) {
      button_1.removeEventListener('click', decrement);
      target.removeChild(button_1);
      target.removeChild(div_3);
      target.removeChild(div_7);
      target.removeChild(div_11);
      button_14.removeEventListener('click', increment);
      target.removeChild(button_14);
      button_16.removeEventListener('click', incrementFoo);
      target.removeChild(button_16);

      isMounted = false;
    },
    captureState() {
      return { counter, foo, increment, decrement, incrementFoo };
    },
  };

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

  update(['quadruple', 'double', 'bar', 'counter', 'foo']);

  function updateReactiveDeclarations(changed) {
    if (['foo'].some((name) => changed.includes(name))) {
      bar = foo + 5;
      update(['bar']);
    }

    if (['counter', 'bar'].some((name) => changed.includes(name))) {
      double = counter * 2 + bar;
      update(['double']);
    }

    if (['double'].some((name) => changed.includes(name))) {
      quadruple = double * 2;
      update(['quadruple']);
    }
  }

  return lifeCycle;
}
