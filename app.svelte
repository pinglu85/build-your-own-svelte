<script>
  let counter = 0;
  let double = 2;
  const increment = () => {
    counter += 1;
    double += 2;
  };
  const decrement = () => {
    counter--;
    double = counter * 2;
  };

  function foo(value) {
    return value;
  }
</script>

<button on:click={decrement}>Decrement</button>
<div>{counter} * {2} = {foo(counter * 2)}</div>
<div>double = {double}</div>
<button on:click={increment}>Increment</button>
