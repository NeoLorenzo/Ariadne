"use client";

import { useEffect, useRef } from "react";

function join(...names) { return names.filter(Boolean).join(" "); }

export function useModalDialog(isOpen, onClose) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);

  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!isOpen) return undefined;

    const previouslyFocused = document.activeElement;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])'
      )).filter((element) => element.matches("summary") || !element.closest("details:not([open])"));
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [isOpen]);

  return dialogRef;
}

export function ModalShell({ as: Element = "section", className, children, ...props }) {
  return <Element className={join("ff-modal-shell", className)} {...props}>{children}</Element>;
}
export function ModalHeader({ className, title, onClose, children, titleId }) {
  return <header className={join("ff-modal-header", className)}>
    {children || <h3 id={titleId}>{title}</h3>}
    {onClose ? <IconButton aria-label="Close" onClick={onClose}>×</IconButton> : null}
  </header>;
}
export function ModalBody({ className, children }) { return <div className={join("ff-modal-body", className)}>{children}</div>; }
export function ModalFooter({ className, children }) { return <footer className={join("ff-modal-footer", className)}>{children}</footer>; }

export function TextInput({ className, ...props }) { return <input className={join("ff-control", "ff-text-input", className)} {...props} />; }
export function TextArea({ className, size = "medium", ...props }) { return <textarea className={join("ff-control", "ff-text-area", `is-${size}`, className)} {...props} />; }
export function Select({ className, children, ...props }) { return <select className={join("ff-control", "ff-select", className)} {...props}>{children}</select>; }
export function DateInput({ className, ...props }) { return <input type="date" className={join("ff-control", "ff-date-input", className)} {...props} />; }

function Button({ tone, className, type = "button", ...props }) { return <button type={type} className={join("ff-button", `is-${tone}`, className)} {...props} />; }
export function PrimaryButton(props) { return <Button tone="primary" {...props} />; }
export function SecondaryButton(props) { return <Button tone="secondary" {...props} />; }
export function GhostButton(props) { return <Button tone="ghost" {...props} />; }
export function IconButton({ className, ...props }) { return <Button tone="icon" className={className} {...props} />; }

export function SectionHeader({ className, title, titleId, eyebrow, actions }) {
  return <header className={join("ff-section-header", className)}><div>{eyebrow ? <span>{eyebrow}</span> : null}<h3 id={titleId}>{title}</h3></div>{actions}</header>;
}
export function ListRow({ as: Element = "div", className, children, ...props }) { return <Element className={join("ff-list-row", className)} {...props}>{children}</Element>; }
export function ProgressBar({ value = 0, className }) { const safe = Math.min(Math.max(Number(value) || 0, 0), 100); return <div className={join("ff-progress", className)} aria-label={`${Math.round(safe)}% complete`}><span style={{ width: `${safe}%` }} /></div>; }
export function StatusIndicator({ status, className }) {
  const label = String(status || "")
    .split("-")
    .map((word) => word ? word.charAt(0).toUpperCase() + word.slice(1) : "")
    .join(" ");
  return <span className={join("ff-status", `is-${status}`, className)}><span aria-hidden="true" />{label}</span>;
}
export function Divider({ className }) { return <hr className={join("ff-divider", className)} />; }
