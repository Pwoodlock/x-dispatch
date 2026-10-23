import * as React from 'react';
import { type VariantProps, cva } from 'class-variance-authority';
import { cn } from '@/lib/utils/helpers';

const badgeVariants = cva(
  'inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-xp-accent-hover',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-accent',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border-border text-foreground',
        success: 'border-success/40 text-success',
        warning: 'border-warning/40 text-warning',
        info: 'border-info/40 text-info',
        danger: 'border-destructive/40 text-destructive',
        /* Categorical chips: hairline border in the category hue, no fill */
        'cat-emerald': 'border-cat-emerald/40 text-cat-emerald',
        'cat-sky': 'border-cat-sky/40 text-cat-sky',
        'cat-amber': 'border-cat-amber/40 text-cat-amber',
        'cat-red': 'border-cat-red/40 text-cat-red',
        'cat-fuchsia': 'border-cat-fuchsia/40 text-cat-fuchsia',
        'cat-blue': 'border-cat-blue/40 text-cat-blue',
        'cat-orange': 'border-cat-orange/40 text-cat-orange',
        'cat-pink': 'border-cat-pink/40 text-cat-pink',
        'cat-teal': 'border-cat-teal/40 text-cat-teal',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return <div ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />;
  }
);
Badge.displayName = 'Badge';

export { Badge, badgeVariants };
