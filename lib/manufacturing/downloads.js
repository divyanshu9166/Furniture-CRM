import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

function getPrimaryImage(imageString) {
  if (!imageString) return null
  const first = String(imageString).split(',')[0]?.trim()
  return first && first.includes('/') ? first : null
}

const FALLBACK_IMAGE = 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="%23cbd5e1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"%3E%3Crect width="18" height="18" x="3" y="3" rx="2" ry="2"/%3E%3Ccircle cx="9" cy="9" r="2"/%3E%3Cpath d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/%3E%3C/svg%3E'

async function imageToDataUri(url) {
  if (!url) return FALLBACK_IMAGE;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return FALLBACK_IMAGE;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(FALLBACK_IMAGE);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    return FALLBACK_IMAGE;
  }
}

async function handleMobileDownload(blob, filename) {
  // Strategy 1: Standard anchor download with blob URL
  // Works on most desktop and mobile browsers (Chrome, Safari 13+, Firefox)
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    
    // Small delay before cleanup to ensure the download starts
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 1500)
    
    return true
  } catch (e) {
    console.warn('Anchor download failed:', e)
  }

  // Strategy 2: Web Share API (works well on Android for sharing files)
  try {
    const file = new File([blob], filename, { type: blob.type })
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: filename,
      })
      return true
    }
  } catch (e) {
    console.warn('Native share failed or aborted:', e)
  }

  // Strategy 3: Convert to data URI and open in new tab (works in WebViews)
  try {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUri = reader.result
      const newTab = window.open(dataUri, '_blank')
      if (!newTab) {
        // If popup was blocked, fall back to replacing current page
        window.location.href = dataUri
      }
    }
    reader.readAsDataURL(blob)
    return true
  } catch (e) {
    console.warn('Data URI fallback failed:', e)
  }

  return false
}

export async function downloadBOMCSV(bom, isWorkSheet = false) {
  const rows = []
  rows.push([isWorkSheet ? 'Work Sheet' : 'BOM Name', bom.name])
  rows.push(['Product', bom.finishedProduct?.name ?? ''])
  rows.push(['SKU', bom.finishedProduct?.sku ?? ''])
  rows.push(['Version', bom.version])
  rows.push(['Estimated Days', bom.estimatedDays ?? ''])
  rows.push(['Standard Time (min)', bom.standardMins ?? (bom.steps?.reduce((s, step) => s + (step.durationMins || 0), 0) ?? 0)])
  rows.push([])
  rows.push(['=== RAW MATERIALS ==='])

  if (isWorkSheet) {
    rows.push(['Material', 'SKU', 'Quantity', 'UoM'])
    bom.items?.forEach(i => {
      rows.push([
        i.rawMaterial?.name ?? '',
        i.rawMaterial?.sku ?? '',
        i.quantity,
        i.unitOfMeasure,
      ])
    })
  } else {
    rows.push(['Material', 'SKU', 'Quantity', 'UoM', 'Wastage%', 'Unit Cost (₹)', 'Total Cost (₹)'])
    bom.items?.forEach(i => {
      const uc = i.unitCost > 0 ? i.unitCost : (i.rawMaterial?.costPrice ?? 0)
      rows.push([
        i.rawMaterial?.name ?? '',
        i.rawMaterial?.sku ?? '',
        i.quantity,
        i.unitOfMeasure,
        i.wastagePercent + '%',
        uc,
        Math.round(i.quantity * (1 + (i.wastagePercent || 0) / 100) * uc),
      ])
    })
    const matTotal = bom.items?.reduce((s, i) => {
      const uc = i.unitCost > 0 ? i.unitCost : (i.rawMaterial?.costPrice ?? 0)
      return s + Math.round(i.quantity * (1 + (i.wastagePercent || 0) / 100) * uc)
    }, 0) ?? 0
    rows.push(['', '', '', '', '', 'Total Material Cost', matTotal])
  }

  rows.push([])
  rows.push(['=== MANUFACTURING STEPS ==='])
  if (isWorkSheet) {
    rows.push(['Step', 'Operation', 'Work Center', 'Duration (min)'])
    bom.steps?.forEach(s => {
      rows.push([s.stepNumber, s.operationName, s.workCenter?.name ?? '', s.durationMins])
    })
  } else {
    rows.push(['Step', 'Operation', 'Work Center', 'Duration (min)', 'Labour Rate ₹/hr', 'Labour Cost/unit ₹', 'Machine Cost/unit ₹', 'Total/unit ₹'])
    let totalStepCost = 0
    bom.steps?.forEach(s => {
      const lc = Math.round((s.durationMins / 60) * s.labourRatePerHour * 100) / 100
      const mc = s.machineCostPerUnit ?? 0
      const total = lc + mc
      totalStepCost += total
      rows.push([s.stepNumber, s.operationName, s.workCenter?.name ?? '', s.durationMins, s.labourRatePerHour, lc.toFixed(2), mc, total.toFixed(2)])
    })
    rows.push(['', '', '', '', '', '', 'Total Step Cost/unit', totalStepCost.toFixed(2)])
    
    rows.push([])
    rows.push(['=== COST SUMMARY (per unit) ==='])
    const matTotal = bom.items?.reduce((s, i) => {
      const uc = i.unitCost > 0 ? i.unitCost : (i.rawMaterial?.costPrice ?? 0)
      return s + Math.round(i.quantity * (1 + (i.wastagePercent || 0) / 100) * uc)
    }, 0) ?? 0
    rows.push(['Material Cost', matTotal])
    rows.push(['Labour + Machine Cost', totalStepCost.toFixed(2)])
    rows.push(['Estimated Total Cost', (matTotal + totalStepCost).toFixed(2)])
    rows.push(['Selling Price', bom.finishedProduct?.price ?? 0])
    rows.push(['Est. Margin', bom.finishedProduct?.price ? (((bom.finishedProduct.price - matTotal - totalStepCost) / bom.finishedProduct.price) * 100).toFixed(1) + '%' : 'N/A'])
  }

  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  
  const prefix = isWorkSheet ? 'WorkSheet' : 'BOM'
  const filename = `${prefix}_${bom.name.replace(/\s+/g, '_')}_v${bom.version}.csv`
  
  await handleMobileDownload(blob, filename)
}

export async function downloadBOMPDF(bom, isWorkSheet = false) {
  const container = document.createElement('div')
  container.style.position = 'absolute'
  container.style.top = '-9999px'
  container.style.left = '0'
  container.style.width = '800px'
  container.style.backgroundColor = '#ffffff'
  container.style.color = '#000000'
  container.style.padding = '40px'
  container.style.fontFamily = 'sans-serif'
  document.body.appendChild(container)

  try {
    const finishedProductImg = await imageToDataUri(getPrimaryImage(bom.finishedProduct?.image))
    
    let html = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px;">
        <div>
          <h1 style="margin: 0; font-size: 24px; font-weight: bold; color: #1e293b;">${isWorkSheet ? 'Manufacturing Work Sheet' : 'Bill of Materials (BOM)'}</h1>
          <h2 style="margin: 8px 0 0 0; font-size: 18px; color: #475569;">${bom.name} (v${bom.version})</h2>
          <p style="margin: 4px 0 0 0; font-size: 14px; color: #64748b;">Est. Time: ${bom.estimatedDays ? bom.estimatedDays + ' days' : ''} ${bom.standardMins ? '(' + bom.standardMins + ' mins)' : ''}</p>
        </div>
        <div style="text-align: right;">
          <div style="width: 100px; height: 100px; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; background-color: #f8fafc; display: flex; align-items: center; justify-content: center; margin-left: auto;">
             <img src="${finishedProductImg}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
          </div>
          <div style="margin-top: 8px; font-size: 14px; font-weight: 500;">${bom.finishedProduct?.name || 'Unknown Product'}</div>
          <div style="font-size: 12px; color: #64748b;">${bom.finishedProduct?.sku || ''}</div>
        </div>
      </div>

      <h3 style="font-size: 16px; margin: 24px 0 12px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">Raw Materials</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px;">
        <thead>
          <tr style="background-color: #f1f5f9; text-align: left;">
            <th style="padding: 8px; border: 1px solid #cbd5e1; width: 60px;">Image</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1;">Material</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1;">SKU</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Quantity</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1;">UoM</th>
            ${!isWorkSheet ? `
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Waste%</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Unit Cost</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Total</th>
            ` : ''}
          </tr>
        </thead>
        <tbody>
    `

    let matTotal = 0
    for (const item of (bom.items || [])) {
      const img = await imageToDataUri(getPrimaryImage(item.rawMaterial?.image))
      const uc = item.unitCost > 0 ? item.unitCost : (item.rawMaterial?.costPrice ?? 0)
      const total = Math.round(item.quantity * (1 + (item.wastagePercent || 0) / 100) * uc)
      matTotal += total

      html += `
        <tr>
          <td style="padding: 4px; border: 1px solid #cbd5e1; text-align: center;">
            <div style="width: 40px; height: 40px; background-color: #f8fafc; border-radius: 4px; border: 1px solid #e2e8f0; overflow: hidden; display: inline-flex; align-items: center; justify-content: center;">
              <img src="${img}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
            </div>
          </td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: 500;">${item.rawMaterial?.name || ''}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; color: #475569;">${item.rawMaterial?.sku || ''}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: 500;">${item.quantity}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.unitOfMeasure}</td>
          ${!isWorkSheet ? `
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">${item.wastagePercent}%</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">₹${uc}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">₹${total}</td>
          ` : ''}
        </tr>
      `
    }
    
    if (!isWorkSheet) {
      html += `
        <tr style="background-color: #f8fafc; font-weight: bold;">
          <td colspan="7" style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Total Material Cost</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">₹${matTotal}</td>
        </tr>
      `
    }
    
    html += `
        </tbody>
      </table>

      <h3 style="font-size: 16px; margin: 24px 0 12px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">Manufacturing Steps</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px;">
        <thead>
          <tr style="background-color: #f1f5f9; text-align: left;">
            <th style="padding: 8px; border: 1px solid #cbd5e1; width: 40px; text-align: center;">Step</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1;">Operation</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1;">Work Center</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Duration (min)</th>
            ${!isWorkSheet ? `
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Labour/hr</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Labour Cost</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Mach. Cost</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Total Cost</th>
            ` : ''}
          </tr>
        </thead>
        <tbody>
    `

    let totalStepCost = 0
    for (const s of (bom.steps || [])) {
      const lc = Math.round((s.durationMins / 60) * s.labourRatePerHour * 100) / 100
      const mc = s.machineCostPerUnit ?? 0
      const total = lc + mc
      totalStepCost += total

      html += `
        <tr>
          <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; font-weight: 500;">${s.stepNumber}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1;">${s.operationName}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; color: #475569;">${s.workCenter?.name || ''}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">${s.durationMins}</td>
          ${!isWorkSheet ? `
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">₹${s.labourRatePerHour}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">₹${lc.toFixed(2)}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">₹${mc.toFixed(2)}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: 500;">₹${total.toFixed(2)}</td>
          ` : ''}
        </tr>
      `
    }
    
    if (!isWorkSheet) {
      html += `
        <tr style="background-color: #f8fafc; font-weight: bold;">
          <td colspan="7" style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Total Step Cost/unit</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">₹${totalStepCost.toFixed(2)}</td>
        </tr>
      `
    }
    
    html += `
        </tbody>
      </table>
    `
    
    if (!isWorkSheet) {
      const sp = bom.finishedProduct?.price ?? 0
      const estTotal = matTotal + totalStepCost
      const margin = sp ? (((sp - estTotal) / sp) * 100).toFixed(1) + '%' : 'N/A'

      html += `
        <h3 style="font-size: 16px; margin: 24px 0 12px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">Cost Summary</h3>
        <table style="width: 300px; border-collapse: collapse; font-size: 12px;">
          <tbody>
            <tr><td style="padding: 8px; border: 1px solid #cbd5e1;">Material Cost</td><td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">₹${matTotal}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #cbd5e1;">Labour & Machine Cost</td><td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">₹${totalStepCost.toFixed(2)}</td></tr>
            <tr style="background-color: #f1f5f9; font-weight: bold;"><td style="padding: 8px; border: 1px solid #cbd5e1;">Estimated Total Cost</td><td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">₹${estTotal.toFixed(2)}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #cbd5e1;">Selling Price</td><td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">₹${sp}</td></tr>
            <tr style="color: ${margin.startsWith('-') ? '#ef4444' : '#10b981'}; font-weight: bold;"><td style="padding: 8px; border: 1px solid #cbd5e1;">Est. Margin</td><td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">${margin}</td></tr>
          </tbody>
        </table>
      `
    }

    container.innerHTML = html

    // Give browser time to paint the DOM and render data URIs
    await new Promise(r => setTimeout(r, 150))

    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false
    })

    const imgData = canvas.toDataURL('image/jpeg', 1.0)
    
    // Calculate PDF dimensions (A4 is 210x297mm)
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width

    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, Math.min(pdfHeight, pdf.internal.pageSize.getHeight()))
    
    // Add additional pages if content overflows
    let heightLeft = pdfHeight - pdf.internal.pageSize.getHeight()
    let position = -pdf.internal.pageSize.getHeight()
    while (heightLeft >= 0) {
      pdf.addPage()
      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight)
      heightLeft -= pdf.internal.pageSize.getHeight()
      position -= pdf.internal.pageSize.getHeight()
    }

    const blob = pdf.output('blob')
    const prefix = isWorkSheet ? 'WorkSheet' : 'BOM'
    const filename = `${prefix}_${bom.name.replace(/\s+/g, '_')}_v${bom.version}.pdf`
    
    await handleMobileDownload(blob, filename)
    
  } catch (err) {
    console.error('PDF generation failed:', err)
    alert('Failed to generate PDF. Check console for details.')
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container)
    }
  }
}
