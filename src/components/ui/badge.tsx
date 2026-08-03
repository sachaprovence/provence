import { clsx } from "clsx";

export type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "info";

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  neutral: "bg-p360-lavender-light text-p360-blue",
  success: "bg-green-100 text-p360-success",
  warning: "bg-yellow-100 text-p360-warning",
  danger: "bg-red-100 text-p360-danger",
  info: "bg-p360-sand-light text-p360-blue-dark",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = "neutral", className, ...rest }: BadgeProps) {
  return <span className={clsx("badge", VARIANT_CLASS[variant], className)} {...rest} />;
}
