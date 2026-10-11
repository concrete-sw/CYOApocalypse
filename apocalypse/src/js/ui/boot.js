// Boot sequence shown before the operator logon.

const LINES = [
  ['EOC-OS 3.2.7 continuity console firmware', 0],
  ['Verifying trusted boot chain .......... OK', 1],
  ['Mounting encrypted volume /ops ........ OK', 1],
  ['Loading regional alert feed ........... OK', 1],
  ['Starting survivor liaison channel ..... OK', 1],
  ['Synchronising weather and hazard grid . OK', 1],
  ['Checking backup power ................. OK', 1],
  ['Checking Game Master uplink ........... DEFERRED (key required)', 2],
  ['', 0],
  ['NOTICE: This console carries emergency traffic. All activity is logged for continuity of operations.', 0],
  ['The network may degrade without warning. Keep this terminal powered.', 0],
  ['', 0],
  ['Press any key or wait for logon...', 0]
];

export function runBoot(el, { reduceMotion = false } = {}) {
  return new Promise(resolve => {
    let i = 0;
    let finished = false;
    const finish = () => { if (finished) return; finished = true; document.removeEventListener('keydown', finish); document.removeEventListener('pointerdown', finish); resolve(); };
    document.addEventListener('keydown', finish);
    document.addEventListener('pointerdown', finish);
    const step = () => {
      if (finished) return;
      if (i >= LINES.length) { setTimeout(finish, reduceMotion ? 0 : 500); return; }
      const [text, kind] = LINES[i++];
      const line = text.replace(/OK$/, '');
      const span = document.createElement('span');
      span.textContent = line;
      if (/OK$/.test(text)) { const ok = document.createElement('span'); ok.className = 'ok'; ok.textContent = 'OK'; span.append(ok); }
      if (kind === 2) span.className = 'warn';
      el.append(span, '\n');
      setTimeout(step, reduceMotion ? 0 : 90 + Math.random() * 160);
    };
    step();
  });
}
