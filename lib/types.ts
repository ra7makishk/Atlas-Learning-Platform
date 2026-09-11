export type PlatformRole = "admin" | "instructor" | "student";
export type PlatformUser = {
  id: number;
  email: string;
  name: string;
  role: PlatformRole;
  status: string;
  phone: string;
  whatsapp: string;
  country: string;
  city: string;
  specialty: string;
  level: string;
  collegeId: number | null;
  universityId: number | null;
  yearId: number | null;
  trustedDeviceId: string | null;
};