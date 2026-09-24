import { Header } from "@/components/dashboard/header"
import { createClient } from "@/lib/supabase/server"
import { PermissionGuard } from "@/components/dashboard/permission-guard"
import { getDefaultCurrencyServer } from "@/lib/utils/currency-server"
import { getUserStoreContext } from "@/lib/utils/store-context"
import { ProductsPageClient } from "@/components/products/products-page-client"

export default async function ProductsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const storeContext = await getUserStoreContext(user.id)
  
  // For admins, don't fetch products initially - they'll be loaded based on store selection
  // For non-admins, fetch their store's products
  let initialProducts: any[] = []
  
  if (!storeContext.canAccessAllStores && storeContext.storeId) {
    const { data: products } = await supabase
      .from("products")
      .select(
        `
        *,
        categories (id, name),
        units (id, name, short_name)
      `,
      )
      .eq("store_id", storeContext.storeId)
      .order("created_at", { ascending: false })
    
    initialProducts = products || []
  }

  const currency = await getDefaultCurrencyServer()

  // Fetch all stores for the selector
  const { data: allStores } = await supabase
    .from("stores")
    .select("id, name")
    .eq("is_active", true)
    .order("name")

  return (
    <PermissionGuard feature="products">
      <div>
        <Header title="Products" />
        <div className="p-6 space-y-4">
          <ProductsPageClient
            initialProducts={initialProducts}
            canAccessAllStores={storeContext.canAccessAllStores}
            userStoreId={storeContext.storeId}
            stores={allStores || []}
            currency={currency}
          />
        </div>
      </div>
    </PermissionGuard>
  )
}
