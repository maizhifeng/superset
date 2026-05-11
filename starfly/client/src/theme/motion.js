// Motion tokens — Material Design 3 easing curves
// Using specific cubic-bezier for character and fluidity
// Duration hierarchy: micro (80ms), quick (150ms), standard (200ms), slow (300ms)

const motion = {
  // Duration hierarchy
  duration: {
    micro: 80,       // icon taps, checkbox checks
    quick: 150,      // button hovers, focus states
    standard: 200,   // card hover lift, dialog open/close
    slow: 300,       // sidebar, page transitions
    slower: 400,     // staggered list animations
  },

  // Material Design 3 easing curves
  // Standard: balanced easing for most transitions
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    decelerate: 'cubic-bezier(0, 0, 0.2, 1)',  // entering elements
    accelerate: 'cubic-bezier(0.3, 0, 1, 1)',  // exiting elements
    emphasized: 'cubic-bezier(0.3, 0, 0, 1)',  // noticeable motion
    snappy: 'cubic-bezier(0.3, 0, 0.1, 1)',    // quick, decisive
  },
}

export default motion
