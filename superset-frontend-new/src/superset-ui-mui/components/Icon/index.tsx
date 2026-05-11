import { type SxProps, type Theme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DashboardIcon from '@mui/icons-material/Dashboard';
import BarChartIcon from '@mui/icons-material/BarChart';
import StorageIcon from '@mui/icons-material/Storage';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import HistoryIcon from '@mui/icons-material/History';
import ShareIcon from '@mui/icons-material/Share';
import PersonIcon from '@mui/icons-material/Person';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import CodeIcon from '@mui/icons-material/Code';
import TableChartIcon from '@mui/icons-material/TableChart';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import PieChartIcon from '@mui/icons-material/PieChart';
import GridOnIcon from '@mui/icons-material/GridOn';
import SaveIcon from '@mui/icons-material/Save';
import EditIcon from '@mui/icons-material/Edit';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsIcon from '@mui/icons-material/Notifications';
import FullscreenIcon from '@mui/icons-material/Fullscreen';

const iconMap: Record<string, React.ComponentType<{ sx?: SxProps<Theme> }>> = {
  plus: AddIcon,
  close: CloseIcon,
  check: CheckIcon,
  chevronLeft: ChevronLeftIcon,
  chevronRight: ChevronRightIcon,
  trash: DeleteIcon,
  eye: VisibilityIcon,
  dashboard: DashboardIcon,
  chart: BarChartIcon,
  database: StorageIcon,
  refresh: RefreshIcon,
  search: SearchIcon,
  filter: FilterListIcon,
  history: HistoryIcon,
  share: ShareIcon,
  user: PersonIcon,
  settings: SettingsIcon,
  logout: LogoutIcon,
  warning: WarningIcon,
  info: InfoIcon,
  code: CodeIcon,
  table: TableChartIcon,
  lineChart: ShowChartIcon,
  pieChart: PieChartIcon,
  grid: GridOnIcon,
  save: SaveIcon,
  edit: EditIcon,
  more: MoreVertIcon,
  menu: MenuIcon,
  notifications: NotificationsIcon,
  fullscreen: FullscreenIcon,
};

interface IconProps {
  name: string;
  size?: number;
  sx?: SxProps<Theme>;
}

export default function Icon({ name, size = 20, sx }: IconProps) {
  const Component = iconMap[name];
  if (!Component) return null;
  return <Component sx={{ fontSize: size, ...sx }} />;
}
