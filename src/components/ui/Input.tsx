import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-9 w-full rounded-md border border-(--border) bg-white px-3 text-sm placeholder:text-(--muted-2)",
      "focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)/20",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-[80px] w-full rounded-md border border-(--border) bg-white p-3 text-sm placeholder:text-(--muted-2)",
      "focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)/20",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-9 w-full rounded-md border border-(--border) bg-white px-2 text-sm",
      "focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)/20",
      className,
    )}
    {...props}
  />
));
Select.displayName = "Select";

export function Field({
  label,
  hint,
  error,
  children,
  required,
  htmlFor,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium text-(--fg)"
      >
        {label}
        {required ? <span className="ml-0.5 text-(--danger)">*</span> : null}
      </label>
      {children}
      {hint && !error ? (
        <span className="text-xs text-(--muted)">{hint}</span>
      ) : null}
      {error ? (
        <span className="text-xs text-(--danger)" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
