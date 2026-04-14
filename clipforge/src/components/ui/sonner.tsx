"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Editorial toast. No coloured fills, no lucide icons, zero radius, 1px border.
 * Type is communicated via a mono uppercase tag prefix (OK / FAIL / NOTE / WARN)
 * and the accent colour is reserved exclusively for errors.
 *
 * Design spec lives in /DESIGN.md.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster"
      position="bottom-right"
      duration={4000}
      visibleToasts={4}
      gap={8}
      offset={24}
      // No richColors. No icons. Type signalled by tag text, not fill.
      icons={{
        success: <Tag>OK</Tag>,
        info: <Tag>NOTE</Tag>,
        warning: <Tag>WARN</Tag>,
        error: <Tag intent="error">FAIL</Tag>,
        loading: <Tag>…</Tag>,
      }}
      style={
        {
          "--normal-bg": "var(--background)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--foreground)",
          "--success-bg": "var(--background)",
          "--success-text": "var(--foreground)",
          "--success-border": "var(--foreground)",
          "--error-bg": "var(--background)",
          "--error-text": "var(--foreground)",
          "--error-border": "var(--accent)",
          "--info-bg": "var(--background)",
          "--info-text": "var(--foreground)",
          "--info-border": "var(--foreground)",
          "--warning-bg": "var(--background)",
          "--warning-text": "var(--foreground)",
          "--warning-border": "var(--foreground)",
          "--border-radius": "0px",
        } as React.CSSProperties
      }
      toastOptions={{
        unstyled: false,
        classNames: {
          toast: [
            // Base editorial shape. Sonner applies its own layout on top, so we
            // only override chrome. 1px border, zero radius, no shadow, linen bg.
            "!rounded-none !shadow-none",
            "!border !border-solid",
            "!bg-background !text-foreground",
            "!font-sans !text-[13px]",
            "!px-4 !py-3.5",
            "!gap-2.5",
            "min-w-[320px] max-w-[420px]",
          ].join(" "),
          title: "!font-sans !text-[13px] !font-medium !tracking-[-0.005em] !leading-[1.4]",
          description: "!font-sans !text-[12px] !text-muted-foreground !leading-[1.45] !mt-0.5",
          icon: "!m-0 !self-start !mt-[1px]",
          actionButton: [
            "!rounded-none !shadow-none",
            "!bg-foreground !text-foreground-inverse",
            "!font-sans !text-[12px] !font-medium",
            "!px-3 !py-1.5",
            "hover:!bg-foreground/90",
          ].join(" "),
          cancelButton: [
            "!rounded-none !shadow-none !bg-transparent",
            "!text-foreground",
            "!font-sans !text-[12px]",
            "!px-3 !py-1.5",
            "hover:!bg-muted",
          ].join(" "),
          closeButton: [
            "!rounded-none !shadow-none !bg-transparent !border-0",
            "!text-muted-foreground hover:!text-foreground",
          ].join(" "),
          error: "!border-accent",
          success: "",
          warning: "",
          info: "",
          loading: "",
        },
      }}
      {...props}
    />
  );
};

function Tag({
  children,
  intent = "default",
}: {
  children: React.ReactNode;
  intent?: "default" | "error";
}) {
  return (
    <span
      className={
        intent === "error"
          ? "font-mono text-[10px] tracking-[0.18em] uppercase text-accent self-start mt-[3px]"
          : "font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground self-start mt-[3px]"
      }
    >
      {children}
    </span>
  );
}

export { Toaster };
