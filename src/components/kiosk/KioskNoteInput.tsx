"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Delete, Keyboard, ArrowUp } from "lucide-react";
import styles from "./kiosk.module.css";

export default function KioskNoteInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(false);
  const [numbers, setNumbers] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const selection = useRef({ start: value.length, end: value.length });
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingCaret.current === null) return;
    input.current?.focus({ preventScroll: true });
    input.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [value]);
  useEffect(() => { if (open) panel.current?.scrollIntoView({ block: "nearest", behavior: "instant" }); }, [open]);
  const insert = (text: string, backspace = false) => {
    const start = input.current?.selectionStart ?? selection.current.start;
    const end = input.current?.selectionEnd ?? selection.current.end;
    const from = backspace && start === end ? Math.max(0, start - 1) : start;
    const available = 200 - (value.length - (end - from));
    const addition = backspace ? "" : text.slice(0, Math.max(0, available));
    const next = value.slice(0, from) + addition + value.slice(end);
    selection.current = { start: from + addition.length, end: from + addition.length };
    pendingCaret.current = next !== value ? from + addition.length : null;
    onChange(next);
    if (shift && !backspace) setShift(false);
  };
  const keys = numbers ? "1234567890@#%&*()-+.,!?/:" : "qwertyuiopasdfghjklzxcvbnm";
  return <div className={styles.note}>
    <label htmlFor="kiosk-note">Catatan untuk dapur <span>(opsional)</span></label>
    <textarea ref={input} id="kiosk-note" inputMode="none" maxLength={200} value={value} onFocus={() => setOpen(true)}
      onSelect={event => { selection.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd }; }}
      onChange={event => onChange(event.target.value)} placeholder="Contoh: tanpa es" />
    <div className={styles.noteTools}><span>{value.length}/200 karakter</span><button type="button" aria-expanded={open} onClick={() => setOpen(current => !current)}><Keyboard size={18}/>{open ? "Tutup keyboard" : "Buka keyboard"}</button></div>
    {open && <div className={styles.keyboard} ref={panel} role="group" aria-label="Keyboard Luujaaa">
      <div className={styles.keyboardHeading}><strong>luujaaa <span>keyboard</span></strong><span>Catatan pesanan</span></div>
      <div className={styles.noteSuggestions}>{["Tanpa es", "Tidak pedas", "Saus dipisah"].map(text => <button type="button" key={text} onPointerDown={event => event.preventDefault()} onClick={() => insert(text)}>{text}</button>)}</div>
      <div className={styles.keyboardKeys}>{Array.from(keys).map(key => <button type="button" key={key} aria-label={`Ketik ${shift ? key.toUpperCase() : key}`} onPointerDown={event => event.preventDefault()} onClick={() => insert(shift ? key.toUpperCase() : key)}>{shift ? key.toUpperCase() : key}</button>)}</div>
      <div className={styles.keyboardActions}>
        <button type="button" aria-label="Huruf kapital" aria-pressed={shift} onPointerDown={event => event.preventDefault()} onClick={() => setShift(current => !current)}><ArrowUp size={19}/></button>
        <button type="button" aria-label={numbers ? "Keyboard huruf" : "Keyboard angka dan simbol"} onPointerDown={event => event.preventDefault()} onClick={() => setNumbers(current => !current)}>{numbers ? "ABC" : "123"}</button>
        <button type="button" className={styles.spaceKey} onPointerDown={event => event.preventDefault()} onClick={() => insert(" ")}>Spasi</button>
        <button type="button" aria-label="Hapus karakter" onPointerDown={event => event.preventDefault()} onClick={() => insert("", true)}><Delete size={20}/></button>
        <button type="button" className={styles.keyboardDone} onClick={() => setOpen(false)}>Selesai</button>
      </div>
    </div>}
  </div>;
}
