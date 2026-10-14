import { useEffect, useRef, type HTMLAttributes } from "react";

/** Keep keyboard and pointer interaction inside the visible modal. */
export function Dialog({
  onDismiss,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  onDismiss?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  }, [onDismiss]);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const siblings: { node: HTMLElement; inert: boolean }[] = [];
    for (
      let node: HTMLElement | null = dialog;
      node?.parentElement;
      node = node.parentElement
    ) {
      for (const sibling of node.parentElement.children) {
        if (sibling !== node && sibling instanceof HTMLElement) {
          siblings.push({ node: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
    }
    const controls = () =>
      [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        ),
      ].filter((node) => !node.closest("[hidden]"));
    const focus = () => (controls()[0] ?? dialog).focus();
    focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismiss.current?.();
      }
      if (event.key === "Tab") {
        const items = controls();
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (
          event.shiftKey
            ? index <= 0
            : index === -1 || index === items.length - 1
        ) {
          event.preventDefault();
          (event.shiftKey
            ? (items.at(-1) ?? dialog)
            : (items[0] ?? dialog)
          ).focus();
        }
      }
    };
    const containFocus = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node)) focus();
    };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", containFocus);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", containFocus);
      siblings.forEach(({ node, inert }) => {
        node.inert = inert;
      });
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div {...props} ref={ref} role="dialog" aria-modal="true" tabIndex={-1}>
      {children}
    </div>
  );
}
