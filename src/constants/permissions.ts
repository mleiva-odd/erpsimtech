import { PERMISSION_GROUPS } from '@/lib/permissions';

export const AVAILABLE_PERMISSIONS = PERMISSION_GROUPS.map((group) => ({
  category: group.name,
  permissions: group.permissions,
}));
