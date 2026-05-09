/*
  Web Tools Companion
  Copyright (C) 2026 Kenneth Westhle A. Davila

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

export type LogLevel = 'info' | 'warn' | 'error' | 'success';
export const beamLog = (message: string, level: LogLevel = 'info') => {
    try {
        chrome.runtime.sendMessage({
            action: 'BEAM_LOG',
            payload: { message, level }
        });

        window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
            detail: {
                action: 'SHOW_LOG',
                message: message,
                logType: level
            }
        }));
    } catch (e) {
    }
};
