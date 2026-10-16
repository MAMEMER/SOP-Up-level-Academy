import { requireUser } from "../../lib/auth.ts";
export default async function DashboardLayout({children}:{children:React.ReactNode}){await requireUser();return <>{children}</>;}
