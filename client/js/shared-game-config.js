(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GameConfig = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, () => {
  const COLORS = ['green', 'red', 'blue', 'yellow'];
  const COLOR_START_POSITIONS = {
    green: 0,
    yellow: 10,
    blue: 20,
    red: 30,
  };
  const BOARD_SIZE = 40;
  const PIECES_PER_PLAYER = 4;
  const SUPER_FIELDS = [
    {
      type: 'extra_roll',
      position: 3,
      title: 'Extra Wurf-Feld',
      description: 'Bei Landung bekommst du sofort einen weiteren Wurf.',
      badge: '+1',
    },
    {
      type: 'swap',
      position: 13,
      title: 'Tausch-Feld',
      description:
        'Bei Landung darfst du deine aktive Figur mit einer gegnerischen Brettfigur tauschen.',
      badge: '⇄',
    },
    {
      type: 'shield',
      position: 23,
      title: 'Schutzfeld',
      description: 'Figuren auf diesem Feld können nicht geschmissen werden.',
      badge: 'S',
    },
    {
      type: 'risk',
      position: 33,
      title: 'Risiko-Feld',
      description:
        'Würfle einmal zusätzlich: 1 zurück ins Haus, 2-3 Felder zurück, 4-6 Felder vor.',
      badge: '?',
    },
  ];

  return {
    COLORS,
    COLOR_START_POSITIONS,
    BOARD_SIZE,
    PIECES_PER_PLAYER,
    SUPER_FIELDS,
  };
});
