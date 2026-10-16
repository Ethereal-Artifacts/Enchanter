import { enchanterDirection, enchanterLanguage, enchanterSupportedLanguages } from './localization';

/** Plain-DOM offline language control. Selection never restarts the instrument. */
export function mountLanguagePicker(root: HTMLElement, button: (label: string) => HTMLButtonElement, onChange: () => void, signal: AbortSignal): void {
  root.className = 'locale locale--inline';
  const trigger = button('EN ▾');
  trigger.classList.add('locale__desktop-trigger', 'locale__desktop-trigger--language');
  delete trigger.dataset.labelSource;
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', 'offline-language-list');
  const panel = document.createElement('section');
  panel.className = 'locale__popover';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Language');
  const heading = document.createElement('h2');
  heading.textContent = 'Language';
  const header = document.createElement('div'); header.className = 'locale__header'; header.append(heading);
  const list = document.createElement('div'); list.className = 'locale__options'; list.id = 'offline-language-list'; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'Language');
  const options: HTMLButtonElement[] = [];
  const metadata = JSON.parse(document.getElementById('enchanter-language-options')?.textContent || '[]') as Array<{code:string; name:string; flags:string[]}>;
  const labels = new Map(metadata.map(option => [option.code, option.name]));
  const flags = new Map(metadata.map(option => [option.code, option.flags]));
  function flagMark(code: string) {
    const mark=document.createElement('span'); mark.className='locale__mark'; mark.setAttribute('aria-hidden','true');
    for(const [index,src] of (flags.get(code)??[]).entries()) {const image=document.createElement('img');image.src=src;image.alt='';image.width=32;image.height=24;if(index>0)image.hidden=true;mark.append(image);}
    return mark;
  }
  const codes = [...metadata.map(option => option.code).filter(code => enchanterSupportedLanguages.includes(code)), ...enchanterSupportedLanguages.filter(code => !labels.has(code))];
  // Shuffle once per page load, matching the shared picker's stable session order.
  for(let index=codes.length-1;index>0;index--){const other=Math.floor(Math.random()*(index+1));[codes[index],codes[other]]=[codes[other]!,codes[index]!];}
  for (const code of codes) {
    let name = labels.get(code) ?? code;
    if (!labels.has(code)) try { name = new Intl.DisplayNames([code], {type:'language'}).of(code) ?? code; } catch {}
    const option = button(name);
    const identity=document.createElement('span');identity.className='locale__identity';identity.lang=code;
    const text=document.createElement('strong');
    if(code==='mn-Mong'){const [script,...qualifier]=name.split(' (');const native=document.createElement('span');native.className='locale__identity-script';native.textContent=script;const english=document.createElement('span');english.textContent=qualifier.length?' ('+qualifier.join(' ('):'';text.append(native,english);}else text.textContent=name;
    identity.append(text);option.querySelector('.btn__label')!.replaceChildren(flagMark(code),identity);
    delete option.dataset.labelSource;
    option.classList.add('locale__option');
    option.dataset.localeCode = code;
    option.setAttribute('role', 'option'); option.dir = 'auto'; option.lang = code;
    option.addEventListener('click', () => {
      document.documentElement.lang = enchanterLanguage(code);
      document.documentElement.dir = enchanterDirection(document.documentElement.lang);
      onChange(); update(); close(); trigger.focus();
    }, {signal});
    options.push(option); list.append(option);
  }
  const baseOrder=[...options];
  function update() {
    const code = enchanterLanguage(document.documentElement.lang || 'en');
    const label = trigger.querySelector<HTMLElement>('.btn__label');
    if (label) {label.replaceChildren(flagMark(code));}
    trigger.setAttribute('aria-label', 'Language: ' + code.toUpperCase());
    options.forEach(option => option.setAttribute('aria-selected', String(option.dataset.localeCode === code)));
    const selected=baseOrder.find(option=>option.dataset.localeCode===code);
    const order=selected?[selected,...baseOrder.filter(option=>option!==selected)]:[...baseOrder];
    const firstMongolian=order.findIndex(option=>option.dataset.localeCode?.startsWith('mn-'));
    const pair=['mn-Mong','mn-Cyrl'].flatMap(code=>order.filter(option=>option.dataset.localeCode===code));
    const grouped=order.filter(option=>!pair.includes(option));
    if(firstMongolian>=0)grouped.splice(firstMongolian,0,...pair);
    options.splice(0,options.length,...grouped);list.append(...options);
  }
  function close() {panel.hidden = true; trigger.setAttribute('aria-expanded','false');}
  trigger.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    trigger.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) {
      const face = trigger.getBoundingClientRect();
      panel.style.left = Math.max(8, Math.min(face.left, innerWidth - Math.min(300, innerWidth-16) - 8)) + 'px';
      panel.style.top = Math.max(8, face.top - Math.min(507, innerHeight * .75) - 12) + 'px';
      (options.find(option => option.getAttribute('aria-selected') === 'true') ?? options[0])?.focus();
    }
  }, {signal});
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') {close(); trigger.focus();}
    if (!panel.hidden && ['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
      event.preventDefault(); const current=options.indexOf(document.activeElement as HTMLButtonElement);
      const index=event.key==='Home'?0:event.key==='End'?options.length-1:(current+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;
      options[index]?.focus();
    }
  }, {signal});
  document.addEventListener('pointerdown', event => {if (!root.contains(event.target as Node)) close();}, {signal});
  panel.append(header, list); root.append(trigger, panel); update();
}
