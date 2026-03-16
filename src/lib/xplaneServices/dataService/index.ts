export { getXPlaneDataManager } from './XPlaneDataManager';
export type { Airport } from './XPlaneDataManager';

export { isSetupComplete } from './config';
export type { XPlaneInstallation } from './config';
export {
  getInstallations,
  getActiveInstallation,
  getActiveInstallationName,
  addInstallation,
  removeInstallation,
  renameInstallation,
  setActiveInstallation,
} from './config';
