import { Header } from "@/components/dashboard/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/server"
import { DollarSign, Package, ShoppingCart, Users } from "lucide-react"
import { getDefaultCurrencyServer } from "@/lib/utils/currency-server"
import { formatCurrency } from "@/lib/utils/currency"
import { PermissionGuard } from "@/components/dashboard/permission-guard"
import { isAdmin } from "@/lib/utils/permissions"

type SaleRow = {
  total_amount: number | string
  amount_paid: number | string | null
  payment_status: string | null
}

/** Match sales-report logic: exclude unpaid/partial credit and cancelled sales. */
function isCompletedSale(sale: SaleRow): boolean {
  const status = sale.payment_status?.toLowerCase()
  if (status === "cancelled" || status === "pending") return false
  if (status === "partial" && Number(sale.amount_paid || 0) < Number(sale.total_amount)) {
    return false
  }
  return true
}

async function getCompletedSalesTotals(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ totalRevenue: number; salesCount: number }> {
  const pageSize = 1000
  let offset = 0
  let totalRevenue = 0
  let salesCount = 0

  // Paginate past Supabase's default 1,000-row cap so revenue matches the full sales count.
  while (true) {
    const { data, error } = await supabase
      .from("sales")
      .select("total_amount, amount_paid, payment_status")
      .range(offset, offset + pageSize - 1)

    if (error) {
      console.error("Dashboard sales totals query error:", error)
      break
    }

    if (!data || data.length === 0) break

    for (const sale of data as SaleRow[]) {
      if (!isCompletedSale(sale)) continue
      totalRevenue += Number(sale.total_amount) || 0
      salesCount += 1
    }

    if (data.length < pageSize) break
    offset += pageSize
  }

  return { totalRevenue, salesCount }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const admin = user ? await isAdmin(user.id) : false

  let stats: Array<{
    name: string
    value: string | number
    icon: typeof DollarSign
    color: string
    bgColor: string
    gradient: string
  }> = []

  // Financial / inventory overview figures are admin-only
  if (admin) {
    const [{ count: productsCount }, { count: customersCount }, { totalRevenue, salesCount }, currency] =
      await Promise.all([
        supabase.from("products").select("*", { count: "exact", head: true }),
        supabase.from("customers").select("*", { count: "exact", head: true }),
        getCompletedSalesTotals(supabase),
        getDefaultCurrencyServer(),
      ])

    stats = [
      {
        name: "Total Revenue",
        value: formatCurrency(totalRevenue, currency),
        icon: DollarSign,
        color: "text-primary",
        bgColor: "bg-primary/10",
        gradient: "from-primary/20 to-primary/5",
      },
      {
        name: "Total Products",
        value: productsCount || 0,
        icon: Package,
        color: "text-secondary",
        bgColor: "bg-secondary/10",
        gradient: "from-secondary/20 to-secondary/5",
      },
      {
        name: "Total Sales",
        value: salesCount || 0,
        icon: ShoppingCart,
        color: "text-accent",
        bgColor: "bg-accent/10",
        gradient: "from-accent/20 to-accent/5",
      },
      {
        name: "Total Customers",
        value: customersCount || 0,
        icon: Users,
        color: "text-teal-600 dark:text-teal-400",
        bgColor: "bg-teal-100 dark:bg-teal-900/30",
        gradient: "from-teal-200/50 to-teal-100/30 dark:from-teal-800/30 dark:to-teal-900/20",
      },
    ]
  }

  return (
    <PermissionGuard feature="dashboard">
      <div>
        <Header title="Dashboard" />
        <div className="p-6 space-y-6">
          {admin && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat) => (
                <Card key={stat.name} className="hover-lift">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{stat.name}</CardTitle>
                    <div className={`rounded-full p-2.5 bg-gradient-to-br ${stat.gradient} ${stat.bgColor} shadow-sm`}>
                      <stat.icon className={`h-5 w-5 ${stat.color}`} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                      {stat.value}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">No recent activity to display</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Low Stock Alerts</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">All products are well stocked</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PermissionGuard>
  )
}
