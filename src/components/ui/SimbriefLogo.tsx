import { cn } from '@/lib/utils/helpers';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Vite handles this import
import simbriefLogo from '../../../assets/SimBrief-logo.png';

interface SimbriefLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  xs: 'h-4',
  sm: 'h-6',
  md: 'h-8',
  lg: 'h-12',
};

export function SimbriefLogo({ size = 'md', className }: SimbriefLogoProps) {
  return (
    <img
      src={simbriefLogo}
      alt="SimBrief"
      className={cn(sizeClasses[size], 'w-auto object-contain', className)}
    />
  );
}
