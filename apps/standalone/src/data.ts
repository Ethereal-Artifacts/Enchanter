import airReagent from './GRIMOIRE/REAGENTS/AIR.json';
import earthReagent from './GRIMOIRE/REAGENTS/EARTH.json';
import fireReagent from './GRIMOIRE/REAGENTS/FIRE.json';
import waterReagent from './GRIMOIRE/REAGENTS/WATER.json';
import airSpell from './GRIMOIRE/SPELLS/AIR.json';
import earthSpell from './GRIMOIRE/SPELLS/EARTH.json';
import fireSpell from './GRIMOIRE/SPELLS/FIRE.json';
import waterSpell from './GRIMOIRE/SPELLS/WATER.json';

import aurora from './presets/stable-b8871c4/aurora.json';
import clockwork from './presets/stable-b8871c4/clockwork.json';
import defaultPreset from './presets/stable-b8871c4/default.json';
import defaultChaotic from './presets/stable-b8871c4/default_chaotic.json';
import jewels from './presets/stable-b8871c4/jewels.json';
import jewelsChaotic from './presets/stable-b8871c4/jewels_chaotic.json';
import mandalas from './presets/stable-b8871c4/mandalas.json';
import mandalasChaotic from './presets/stable-b8871c4/mandalas_chaotic.json';

export const grimoire = {
  spells: { AIR: airSpell, EARTH: earthSpell, FIRE: fireSpell, WATER: waterSpell },
  reagents: { AIR: airReagent, EARTH: earthReagent, FIRE: fireReagent, WATER: waterReagent }
} as const;

// Authored files store flat configuration plus macros. The runtime manager
// consumes named presets; preserve source bytes and adapt only this boundary.
export const stablePresets = Object.entries({
  aurora,
  clockwork,
  default: defaultPreset,
  jewels,
  mandalas,
  default_chaotic: defaultChaotic,
  jewels_chaotic: jewelsChaotic,
  mandalas_chaotic: mandalasChaotic
}).map(([name, { macros, ...config }]) => ({ name, config, macros }));
