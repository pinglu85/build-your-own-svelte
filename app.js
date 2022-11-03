export default function () {
  let counter = 0;
  const increment = () => (counter++, lifeCycle.update(['counter']));
  const decrement = () => (counter--, lifeCycle.update(['counter']));
  let button_1;
  let txt_2;
  let txt_3;
  let button_4;
  let txt_5;

  const lifeCycle = {
    create(target) {
      button_1 = document.createElement('button');
      button_1.addEventListener('click', decrement);
      txt_2 = document.createTextNode('Decrement');
      button_1.appendChild(txt_2);
      target.appendChild(button_1);
      txt_3 = document.createTextNode(counter);
      target.appendChild(txt_3);
      button_4 = document.createElement('button');
      button_4.addEventListener('click', increment);
      txt_5 = document.createTextNode('Increment');
      button_4.appendChild(txt_5);
      target.appendChild(button_4);
    },
    update(changed) {
      if (changed.includes('counter')) {
        txt_3.data = counter;
      }
    },
    destroy() {
      button_1.removeEventListener('click', decrement);
      target.removeChild(button_1);
      button_4.removeEventListener('click', increment);
      target.removeChild(button_4);
    },
  };

  return lifeCycle;
}
