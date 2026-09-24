"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Download } from "lucide-react"
import { formatCurrency, type Currency } from "@/lib/utils/currency"

type NamedRef = { id: string; name: string } | null
type UnitRef = { id: string; name: string; short_name: string } | null

type Product = {
  id: string
  name: string
  cost_price: number
  selling_price: number
  wholesale_price?: number | null
  stock_quantity: number
  is_active?: boolean
  categories?: NamedRef | NamedRef[]
  units?: UnitRef | UnitRef[]
}

interface DownloadProductsReportProps {
  products: Product[]
  currency: Currency
}

type ColumnId =
  | "name"
  | "category"
  | "cost"
  | "selling"
  | "wholesale"
  | "stock"
  | "buyingValue"
  | "sellingValue"
  | "status"

type Align = "left" | "right" | "center"

type ReportColumn = {
  id: ColumnId
  label: string
  align: Align
  summary?: "buying" | "selling" | "stock"
}

const REPORT_COLUMNS: ReportColumn[] = [
  { id: "name", label: "Product Name", align: "left" },
  { id: "category", label: "Category", align: "left" },
  { id: "cost", label: "Buying Price", align: "right" },
  { id: "selling", label: "Selling Price", align: "right" },
  { id: "wholesale", label: "Wholesale Price", align: "right" },
  { id: "stock", label: "Stock", align: "right", summary: "stock" },
  { id: "buyingValue", label: "Total Buying Value", align: "right", summary: "buying" },
  { id: "sellingValue", label: "Total Selling Value", align: "right", summary: "selling" },
  { id: "status", label: "Status", align: "center" },
]

const ALL_COLUMN_IDS = REPORT_COLUMNS.map((column) => column.id)

function firstRef<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function pdfText(value: string) {
  return value.replace(/[^\u0020-\u00FF]/g, "").trim()
}

function pdfMoney(amount: number, currency: Currency) {
  const formatted = pdfText(formatCurrency(amount, currency))
  if (formatted) return formatted
  const numberOnly = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${currency.code} ${numberOnly}`
}

function columnValue(product: Product, columnId: ColumnId, currency: Currency) {
  const category = firstRef(product.categories)
  const unit = firstRef(product.units)
  const buyingValue = Number(product.cost_price || 0) * Number(product.stock_quantity || 0)
  const sellingValue = Number(product.selling_price || 0) * Number(product.stock_quantity || 0)
  const stockLabel = `${product.stock_quantity ?? 0}${unit?.short_name ? ` ${unit.short_name}` : ""}`

  switch (columnId) {
    case "name":
      return pdfText(product.name || "")
    case "category":
      return pdfText(category?.name || "N/A")
    case "cost":
      return pdfMoney(Number(product.cost_price || 0), currency)
    case "selling":
      return pdfMoney(Number(product.selling_price || 0), currency)
    case "wholesale":
      return product.wholesale_price ? pdfMoney(Number(product.wholesale_price), currency) : "N/A"
    case "stock":
      return pdfText(stockLabel)
    case "buyingValue":
      return pdfMoney(buyingValue, currency)
    case "sellingValue":
      return pdfMoney(sellingValue, currency)
    case "status":
      return product.is_active === false ? "Inactive" : "Active"
  }
}

export function DownloadProductsReport({ products, currency }: DownloadProductsReportProps) {
  const [open, setOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedIds, setSelectedIds] = useState<ColumnId[]>(ALL_COLUMN_IDS)

  const selectedColumns = REPORT_COLUMNS.filter((column) => selectedIds.includes(column.id))

  const toggleColumn = (columnId: ColumnId) => {
    setSelectedIds((current) =>
      current.includes(columnId) ? current.filter((id) => id !== columnId) : [...current, columnId],
    )
  }

  const generatePDF = async () => {
    if (products.length === 0) {
      alert("No products to export")
      return
    }
    if (selectedColumns.length === 0) {
      alert("Select at least one column")
      return
    }

    setIsGenerating(true)
    try {
      const { jsPDF } = await import("jspdf")
      const { autoTable } = await import("jspdf-autotable")

      const today = new Date().toLocaleDateString()
      const totalBuyingValue = products.reduce(
        (sum, product) => sum + Number(product.cost_price || 0) * Number(product.stock_quantity || 0),
        0,
      )
      const totalSellingValue = products.reduce(
        (sum, product) => sum + Number(product.selling_price || 0) * Number(product.stock_quantity || 0),
        0,
      )
      const totalStock = products.reduce((sum, product) => sum + Number(product.stock_quantity || 0), 0)

      const summaryLines = selectedColumns.flatMap((column) => {
        if (column.summary === "buying") return [`Total Buying Value: ${pdfMoney(totalBuyingValue, currency)}`]
        if (column.summary === "selling") return [`Total Selling Value: ${pdfMoney(totalSellingValue, currency)}`]
        if (column.summary === "stock") return [`Total Stock Quantity: ${totalStock}`]
        return []
      })

      const body = products.map((product) =>
        selectedColumns.map((column) => columnValue(product, column.id, currency)),
      )

      const footerCells: Array<string | { content: string; colSpan?: number; styles?: { halign: Align; fontStyle: "bold" } }> = []
      let pendingSpan = 0
      let totalLabelPlaced = false
      const hasSummaryColumn = selectedColumns.some((column) => column.summary)

      if (hasSummaryColumn) {
        for (const column of selectedColumns) {
          if (!column.summary) {
            if (!totalLabelPlaced) pendingSpan += 1
            else footerCells.push("")
            continue
          }

          if (!totalLabelPlaced && pendingSpan > 0) {
            footerCells.push({
              content: "TOTAL",
              colSpan: pendingSpan,
              styles: { halign: "left", fontStyle: "bold" },
            })
          }
          totalLabelPlaced = true

          const content =
            column.summary === "stock"
              ? String(totalStock)
              : column.summary === "buying"
                ? pdfMoney(totalBuyingValue, currency)
                : pdfMoney(totalSellingValue, currency)
          footerCells.push({ content, styles: { halign: "right", fontStyle: "bold" } })
        }
      }

      const columnStyles: Record<number, { halign: Align }> = {}
      selectedColumns.forEach((column, index) => {
        if (column.align !== "left") columnStyles[index] = { halign: column.align }
      })

      const doc = new jsPDF({
        orientation: selectedColumns.length > 4 ? "landscape" : "portrait",
        unit: "mm",
        format: "a4",
      })
      const pageWidth = doc.internal.pageSize.getWidth()

      doc.setFontSize(16)
      doc.setTextColor(40)
      doc.text("Products Inventory Report", pageWidth / 2, 14, { align: "center" })
      doc.setFontSize(10)
      doc.setTextColor(90)
      doc.text(`Generated on: ${today}`, pageWidth / 2, 20, { align: "center" })
      doc.text(`Total Products: ${products.length}`, pageWidth / 2, 26, { align: "center" })

      doc.setFontSize(9)
      doc.setTextColor(40)
      summaryLines.forEach((line, index) => {
        doc.text(line, 10, 34 + index * 5)
      })

      autoTable(doc, {
        startY: 34 + summaryLines.length * 5 + (summaryLines.length > 0 ? 3 : 0),
        head: [selectedColumns.map((column) => column.label)],
        body,
        foot: footerCells.length > 0 ? [footerCells] : undefined,
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 1.5, overflow: "linebreak" },
        headStyles: { fillColor: [51, 51, 51], textColor: 255, fontStyle: "bold" },
        footStyles: { fillColor: [51, 51, 51], textColor: 255 },
        alternateRowStyles: { fillColor: [249, 249, 249] },
        columnStyles,
        margin: { left: 10, right: 10, top: 12, bottom: 16 },
        showHead: "everyPage",
        didDrawPage: (data) => {
          doc.setPage(data.pageNumber)
          const pageHeight = doc.internal.pageSize.getHeight()
          doc.setFontSize(8)
          doc.setTextColor(120)
          doc.text(
            "This is a computer-generated report and does not require a signature.",
            pageWidth / 2,
            pageHeight - 8,
            { align: "center" },
          )
          doc.text(`Page ${data.pageNumber}`, pageWidth - 10, pageHeight - 8, { align: "right" })
        },
      })

      const fileDate = new Date().toISOString().slice(0, 10)
      doc.save(`products-report-${fileDate}.pdf`)
      setOpen(false)
    } catch (error) {
      console.error("Failed to create products PDF:", error)
      alert("Could not create the PDF report. Please try again.")
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={products.length === 0}>
        <Download className="mr-2 h-4 w-4" />
        Download Report
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Download products report</DialogTitle>
            <DialogDescription>
              Choose the columns to include. {products.length} product{products.length === 1 ? "" : "s"} will be exported.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedIds(ALL_COLUMN_IDS)}>
              Select all
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
              Clear
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {REPORT_COLUMNS.map((column) => (
              <label key={column.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={selectedIds.includes(column.id)}
                  onChange={() => toggleColumn(column.id)}
                />
                {column.label}
              </label>
            ))}
          </div>
          {selectedColumns.length === 0 && (
            <p className="text-sm text-destructive">Select at least one column.</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isGenerating}>
              Cancel
            </Button>
            <Button type="button" onClick={generatePDF} disabled={selectedColumns.length === 0 || isGenerating}>
              <Download className="mr-2 h-4 w-4" />
              {isGenerating ? "Creating PDF..." : "Download PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
