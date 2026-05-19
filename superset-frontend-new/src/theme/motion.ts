const motion = {
  duration: {
    micro: 80,
    quick: 150,
    standard: 200,
    slow: 300,
    slower: 400,
  },
  easing: {
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    decelerate: "cubic-bezier(0, 0, 0.2, 1)",
    accelerate: "cubic-bezier(0.3, 0, 1, 1)",
    emphasized: "cubic-bezier(0.3, 0, 0, 1)",
    snappy: "cubic-bezier(0.3, 0, 0.1, 1)",
  },
};

export const timing = {
  quick: "150ms cubic-bezier(0.2, 0, 0, 1)",
  standard: "200ms cubic-bezier(0, 0, 0.2, 1)",
  slow: "300ms cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

export const transitions = {
  ...timing,
  backgroundColor: `background-color ${timing.quick}`,
  boxShadow: `box-shadow ${timing.standard}`,
  transform: `transform 200ms cubic-bezier(0.2, 0, 0, 1)`,
  borderColor: "border-color 200ms ease",
  color: `color ${timing.quick}`,
  opacity: "opacity 200ms ease",
  background: `background ${timing.quick}`,
} as const;

export default motion;
