/**
 * Lucide icon barrel — every icon used by the app gets re-exported here
 * with a domain-friendly name. Keeping the surface small + named in one
 * place means:
 *
 *   - tree-shaking works: importing Icons.Home only pulls Home, not the
 *     1300-icon Lucide bundle (lucide-react-native is per-icon ESM)
 *   - swapping the icon library later (e.g., for a brand SVG set in
 *     A4g) only edits this file
 *   - call sites stay readable: <Icons.BookingConfirmed /> beats
 *     <CheckCircle2 />
 *
 * Pattern: name icons by *meaning*, not by Lucide's raw name. The raw
 * name still appears as the `as` source so future maintainers can grep.
 */
import {
  AlertCircle as AlertIcon,
  ArrowLeft as ArrowLeftIcon,
  Calendar as CalendarIcon,
  Car as CarIcon,
  CheckCircle2 as CheckIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Clock as ClockIcon,
  Home as HomeIcon,
  LogOut as LogOutIcon,
  MapPin as MapPinIcon,
  RefreshCw as RefreshIcon,
  User as UserIcon,
  XCircle as XCircleIcon,
  X as XIcon,
} from "lucide-react-native";

export const Icons = {
  Home: HomeIcon,
  Calendar: CalendarIcon,
  User: UserIcon,
  Car: CarIcon,
  MapPin: MapPinIcon,
  Clock: ClockIcon,
  ChevronRight: ChevronRightIcon,
  ChevronLeft: ChevronLeftIcon,
  ArrowLeft: ArrowLeftIcon,
  Close: XIcon,
  XCircle: XCircleIcon,
  Alert: AlertIcon,
  Check: CheckIcon,
  Refresh: RefreshIcon,
  LogOut: LogOutIcon,
};

export type IconName = keyof typeof Icons;
