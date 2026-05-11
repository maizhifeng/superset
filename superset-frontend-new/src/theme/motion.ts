const motion = {
  duration: {
    micro: 80,
    quick: 150,
    standard: 200,
    slow: 300,
    slower: 400,
  },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
    accelerate: 'cubic-bezier(0.3, 0, 1, 1)',
    emphasized: 'cubic-bezier(0.3, 0, 0, 1)',
    snappy: 'cubic-bezier(0.3, 0, 0.1, 1)',
  },
};

export default motion;
