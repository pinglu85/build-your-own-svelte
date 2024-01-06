export default function () {
  let counter = 0;
  let double = 2;
  const increment = () => {
    (counter += 1), lifeCycle.update(['counter']);
    (double += 2), lifeCycle.update(['double']);
  };
  const decrement = () => {
    counter--, lifeCycle.update(['counter']);
    (double = counter * 2), lifeCycle.update(['double']);
  };
  function foo(value) {
    return value;
  }
  let button_1;
  let txt_2;
  let div_3;
  let txt_4;
  let txt_5;
  let txt_6;
  let txt_7;
  let txt_8;
  let div_9;
  let txt_10;
  let txt_11;
  let button_12;
  let txt_13;

  const lifeCycle = {
    create(target) {
      button_1 = document.createElement('button');
      button_1.addEventListener('click', decrement);
      txt_2 = document.createTextNode('Decrement');
      button_1.appendChild(txt_2);
      target.appendChild(button_1);
      div_3 = document.createElement('div');
      txt_4 = document.createTextNode(counter);
      div_3.appendChild(txt_4);
      txt_5 = document.createTextNode(' * ');
      div_3.appendChild(txt_5);
      txt_6 = document.createTextNode(2);
      div_3.appendChild(txt_6);
      txt_7 = document.createTextNode(' = ');
      div_3.appendChild(txt_7);
      txt_8 = document.createTextNode(foo(counter * 2));
      div_3.appendChild(txt_8);
      target.appendChild(div_3);
      div_9 = document.createElement('div');
      txt_10 = document.createTextNode('double = ');
      div_9.appendChild(txt_10);
      txt_11 = document.createTextNode(double);
      div_9.appendChild(txt_11);
      target.appendChild(div_9);
      button_12 = document.createElement('button');
      button_12.addEventListener('click', increment);
      txt_13 = document.createTextNode('Increment');
      button_12.appendChild(txt_13);
      target.appendChild(button_12);
    },
    update(changed) {
      if (changed.includes('counter')) {
        txt_4.data = counter;
      }
      if (changed.includes('counter')) {
        txt_8.data = foo(counter * 2);
      }
      if (changed.includes('double')) {
        txt_11.data = double;
      }
    },
    destroy(target) {
      button_1.removeEventListener('click', decrement);
      target.removeChild(button_1);
      target.removeChild(div_3);
      target.removeChild(div_9);
      button_12.removeEventListener('click', increment);
      target.removeChild(button_12);
    },
  };

  return lifeCycle;
}
