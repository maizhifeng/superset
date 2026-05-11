import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import DashboardIcon from '@mui/icons-material/Dashboard';
import BarChartIcon from '@mui/icons-material/BarChart';
import StorageIcon from '@mui/icons-material/Storage';
import WarningIcon from '@mui/icons-material/Warning';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import FilterListIcon from '@mui/icons-material/FilterList';
import CircularProgress from '@mui/material/CircularProgress';
import UndoIcon from '@mui/icons-material/Undo';
import InboxIcon from '@mui/icons-material/Inbox';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import PieChartIcon from '@mui/icons-material/PieChart';
import TableChartIcon from '@mui/icons-material/TableChart';
import AreaChartIcon from '@mui/icons-material/AreaChart';
import GridOnIcon from '@mui/icons-material/GridOn';
import TagIcon from '@mui/icons-material/Tag';
import HistoryIcon from '@mui/icons-material/History';
import PushPinIcon from '@mui/icons-material/PushPin';
import LayersIcon from '@mui/icons-material/Layers';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import SmartphoneIcon from '@mui/icons-material/Smartphone';
import VideogameAssetIcon from '@mui/icons-material/VideogameAsset';
import ShareIcon from '@mui/icons-material/Share';
import CampaignIcon from '@mui/icons-material/Campaign';
import ViewQuiltIcon from '@mui/icons-material/ViewQuilt';
import PersonIcon from '@mui/icons-material/Person';
import CableIcon from '@mui/icons-material/Cable';
import GroupWorkIcon from '@mui/icons-material/GroupWork';
import DnsIcon from '@mui/icons-material/Dns';

const iconMap = {
  plus: AddIcon,
  close: CloseIcon,
  x: CloseIcon,
  check: CheckIcon,
  chevronLeft: ChevronLeftIcon,
  chevronRight: ChevronRightIcon,
  chevronUp: KeyboardArrowUpIcon,
  chevronDown: KeyboardArrowDownIcon,
  trash: DeleteIcon,
  eye: VisibilityIcon,
  fullscreen: FullscreenIcon,
  dashboard: DashboardIcon,
  chart: BarChartIcon,
  barChart3: BarChartIcon,
  database: StorageIcon,
  storage: StorageIcon,
  warning: WarningIcon,
  refresh: RefreshIcon,
  search: SearchIcon,
  copy: ContentCopyIcon,
  calendar: CalendarTodayIcon,
  filter: FilterListIcon,
  spinner: CircularProgress,
  undo: UndoIcon,
  empty: InboxIcon,
  sparkles: AutoAwesomeIcon,
  lineChart: ShowChartIcon,
  pieChart: PieChartIcon,
  table: TableChartIcon,
  areaChart: AreaChartIcon,
  layoutGrid: GridOnIcon,
  numberCard: TagIcon,
  history: HistoryIcon,
  pin: PushPinIcon,
  layerGroup: LayersIcon,
  columns: ViewColumnIcon,
  smartphone: SmartphoneIcon,
  gamepad: VideogameAssetIcon,
  share: ShareIcon,
  megaphone: CampaignIcon,
  layout: ViewQuiltIcon,
  user: PersonIcon,
  plug: CableIcon,
  cohort: GroupWorkIcon,
  server: DnsIcon,
};

export function Icon({ name, size = 16, className, sx, ...props }) {
  const IconComponent = iconMap[name];
  if (!IconComponent) return null;
  if (name === 'spinner') {
    return <CircularProgress size={size} className={className} sx={sx} {...props} />;
  }
  return <IconComponent sx={{ fontSize: size, ...sx }} className={className} {...props} />;
}

export const Icons = iconMap;
