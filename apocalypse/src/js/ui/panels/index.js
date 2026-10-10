// Every desktop panel is registered here, in dock order.

import { registerLog } from './log.js';
import { registerStatus } from './status.js';
import { registerInventory } from './inventory.js';
import { registerCompanions } from './companions.js';
import { registerMap } from './map.js';
import { registerShelter } from './shelter.js';
import { registerRadio } from './radio.js';
import { registerJournal } from './journal.js';
import { registerFactions } from './factions.js';
import { registerSettings } from './settings.js';
import { registerHelp } from './help.js';

export const DOCK_ORDER = ['log', 'status', 'inventory', 'companions', 'map', 'shelter', 'radio', 'journal', 'factions', '---', 'tile', 'settings', 'help'];

export function registerPanels(app) {
  const ctx = { S: () => app.state, reg: def => app.wm.register(def), readOnly: () => !!app.state?.ended };
  for (const fn of [registerLog, registerStatus, registerInventory, registerCompanions, registerMap, registerShelter, registerRadio, registerJournal, registerFactions, registerSettings, registerHelp]) fn(app, ctx);
}
