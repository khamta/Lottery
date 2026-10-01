"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn, formatAmount, formatAmountInput, parseAmount } from "@/lib/utils";

/**
 * ช่องกรอกราคา / จำนวนเงิน — แสดงตัวคั่นหลักพันเป็น "." ระหว่างพิมพ์ (1.000 · 1.000.000)
 * ทศนิยมพิมพ์ด้วย "," แต่ค่าที่ส่งออกทาง onChange เป็น number เสมอ ใช้กับ FormField ได้ตรง ๆ:
 *
 *   <FormControl><AmountInput {...field} /></FormControl>
 */
type AmountInputProps = Omit<React.ComponentProps<"input">, "type" | "value" | "defaultValue" | "onChange"> & {
  value: number | string | null | undefined;
  onChange: (value: number) => void;
  /** จำนวนหลักทศนิยมที่ยอมให้พิมพ์ (0 = จำนวนเต็ม) */
  decimals?: number;
};

const countKept = (text: string) => text.replace(/[^\d,]/g, "").length;

export function AmountInput({ value, onChange, decimals = 2, ...props }: AmountInputProps) {
  const numeric = typeof value === "number" ? value : parseAmount(String(value ?? ""));
  const [text, setText] = React.useState(() => (numeric ? formatAmount(numeric, decimals) : ""));
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const caretRef = React.useRef<number | null>(null);

  // ค่าเปลี่ยนจากข้างนอก (เช่น form.reset ตอนเปิด dialog) → จัดรูปใหม่
  React.useEffect(() => {
    if (parseAmount(text) !== numeric) setText(numeric ? formatAmount(numeric, decimals) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numeric, decimals]);

  // คง caret ไว้หลังตัวเลขตัวเดิม แม้จะมี "." งอกขึ้น/หายไป
  React.useLayoutEffect(() => {
    const el = inputRef.current;
    const kept = caretRef.current;
    if (!el || kept === null) return;
    caretRef.current = null;
    let pos = 0;
    for (let seen = 0; pos < text.length && seen < kept; pos++) {
      if (/[\d,]/.test(text[pos])) seen++;
    }
    el.setSelectionRange(pos, pos);
  }, [text]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    let raw = event.target.value;
    const caret = event.target.selectionStart ?? raw.length;
    // แป้นตัวเลขบนมือถือมักมีแต่ "." — พิมพ์ "." เพิ่มหนึ่งตัวให้ถือเป็นจุดทศนิยม ","
    if (decimals > 0 && raw.length === text.length + 1 && raw[caret - 1] === "." && !text.includes(",")) {
      raw = `${raw.slice(0, caret - 1)},${raw.slice(caret)}`;
    }
    const next = formatAmountInput(raw, decimals);
    caretRef.current = countKept(raw.slice(0, caret));
    setText(next);
    onChange(parseAmount(next));
  }

  return (
    <Input
      {...props}
      ref={(el) => {
        inputRef.current = el;
        const { ref } = props;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      type="text"
      inputMode={decimals > 0 ? "decimal" : "numeric"}
      autoComplete="off"
      className={cn("tabular-nums", props.className)}
      value={text}
      onChange={handleChange}
    />
  );
}
