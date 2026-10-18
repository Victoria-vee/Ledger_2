import {
  faArrowDown,
  faArrowRightArrowLeft,
  faArrowTrendDown,
  faArrowTrendUp,
  faArrowUpRightFromSquare,
  faCalculator,
  faChartLine,
  faChevronDown,
  faChevronRight,
  faCircleCheck,
  faGaugeHigh,
  faMagnifyingGlass,
  faPenToSquare,
  faPlus,
  faStore,
  faTags,
  faTrashCan,
  faWandMagicSparkles,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const icons = {
  activity: faChartLine,
  arrowDown: faArrowDown,
  arrowUpRight: faArrowUpRightFromSquare,
  arrowTrendDown: faArrowTrendDown,
  arrowTrendUp: faArrowTrendUp,
  briefcase: faStore,
  calculator: faCalculator,
  check: faCircleCheck,
  chevron: faChevronRight,
  close: faXmark,
  dashboard: faGaugeHigh,
  edit: faPenToSquare,
  plus: faPlus,
  search: faMagnifyingGlass,
  sparkles: faWandMagicSparkles,
  savedPrices: faTags,
  trash: faTrashCan,
  wallet: faArrowRightArrowLeft,
  selectChevron: faChevronDown,
};

interface IconProps {
  name: keyof typeof icons;
  className?: string;
}

export default function Icon({
  name,
  className = "size-[var(--icon-size-md)]",
}: IconProps) {
  return (
    <FontAwesomeIcon aria-hidden="true" className={className} icon={icons[name]} />
  );
}
