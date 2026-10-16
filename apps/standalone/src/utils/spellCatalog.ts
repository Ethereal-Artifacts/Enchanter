/**
 * User-approved Scenes, plus the four elemental colorways (Reagents).
 * File ids remain the authored AVE preset names.
 */

export const ELEMENTS = ['EARTH', 'WATER', 'AIR', 'FIRE'] as const;
export type ElementId = (typeof ELEMENTS)[number];

export const ELEMENT_GLYPH: Record<ElementId, string> = {
  EARTH: '🜃',
  WATER: '🜄',
  AIR: '🜁',
  FIRE: '🜂'
};

/**
 * Element control colorways:
 * Core/Earth, Interface/Water, Payload/Air, Module/Fire.
 */
export const ELEMENT_FILTER_COLOR: Record<
  ElementId,
  'core-purple' | 'interface-blue' | 'payload-gold' | 'module-red'
> = {
  EARTH: 'core-purple',
  WATER: 'interface-blue',
  AIR: 'payload-gold',
  FIRE: 'module-red'
};

/**
 * User-approved Scene names and selection order. Preset behavior is unchanged.
 */
export const SPELL_PRESETS = [
  { id: 'default', title: 'Folsom' },
  { id: 'mandalas', title: 'Palace of Fine Arts' },
  { id: 'clockwork', title: 'Tenderloin' },
  { id: 'jewels', title: 'Sutro Baths' },
  { id: 'mandalas_chaotic', title: 'Battery Davis' },
  { id: 'jewels_chaotic', title: 'Jingletown' },
  { id: 'default_chaotic', title: 'Bayview' },
  { id: 'aurora', title: 'Fort Funston' }
] as const;

export type SpellPresetId = (typeof SPELL_PRESETS)[number]['id'];

/** Default Spell pattern when an Element is chosen (matches GRIMOIRE placeholderPreset). */
export const ELEMENT_DEFAULT_SPELL: Record<ElementId, SpellPresetId> = {
  EARTH: 'mandalas',
  WATER: 'aurora',
  AIR: 'jewels',
  FIRE: 'clockwork'
};

export function spellTitleFor(id: string): string {
  const hit = SPELL_PRESETS.find((s) => s.id === id);
  return hit?.title ?? id;
}

export const QUANTIZER_FPS_OPTIONS = [
  { value: 0, label: 'Auto (display)' },
  { value: 24, label: '24' },
  { value: 30, label: '30' },
  { value: 48, label: '48' },
  { value: 60, label: '60' },
  { value: 120, label: '120' }
] as const;
