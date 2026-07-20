import PDFDocument from 'pdfkit';

/**
 * Generate a PDF invoice as a buffer
 * @param {Object} invoice - Invoice document
 * @param {Object} bill - Bill document
 * @param {Array} items - List of populated BillItems
 * @param {Object} customer - Customer document (optional)
 * @returns {Promise<Buffer>}
 */
export const generateInvoicePdfBuffer = (invoice, bill, items, customer) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on('error', (err) => reject(err));

      // 1. Header (Store details)
      doc.font('Helvetica-Bold').fontSize(22).text('FLAREMINDS TEXTILES', { align: 'center' });
      doc.font('Helvetica').fontSize(10).text('123 Fashion Street, Mumbai, Maharashtra - 400001', { align: 'center' });
      doc.text('GSTIN: 27AAAAA1111A1Z1 | Contact: +91-9876543210', { align: 'center' });
      doc.moveDown(1.5);

      // Line separator
      doc.moveTo(50, 115).lineTo(545, 115).strokeColor('#cccccc').lineWidth(1).stroke();

      // 2. Invoice Meta Details & Customer Details
      doc.font('Helvetica-Bold').fontSize(10).text('INVOICE DETAILS', 50, 130);
      doc.font('Helvetica').text(`Invoice Number: ${invoice.invoiceNumber}`, 50, 145);
      doc.text(`Date & Time: ${new Date(invoice.createdAt).toLocaleString()}`, 50, 157);
      doc.font('Helvetica-Bold').text(`Status: ${invoice.invoiceStatus.toUpperCase()}`, 50, 169);

      doc.font('Helvetica-Bold').text('CUSTOMER DETAILS', 300, 130);
      const custName = customer ? customer.customerName : 'Walk-in / Guest Customer';
      const custMobile = customer ? customer.mobile : 'N/A';
      doc.font('Helvetica').text(`Name: ${custName}`, 300, 145);
      doc.text(`Mobile: ${custMobile}`, 300, 157);
      doc.font('Helvetica-Bold').text(`Payment Method: ${bill.paymentMethod ? bill.paymentMethod.toUpperCase() : 'N/A'}`, 300, 169);

      // Line separator
      doc.moveTo(50, 195).lineTo(545, 195).strokeColor('#cccccc').lineWidth(1).stroke();

      // 3. Products Table Header
      let y = 210;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Product / Item Name', 50, y);
      doc.text('Qty', 260, y, { width: 30, align: 'right' });
      doc.text('Price (₹)', 305, y, { width: 50, align: 'right' });
      doc.text('GST', 370, y, { width: 35, align: 'right' });
      doc.text('Discount (₹)', 420, y, { width: 60, align: 'right' });
      doc.text('Total (₹)', 495, y, { width: 50, align: 'right' });

      // Table line
      doc.moveTo(50, y + 15).lineTo(545, y + 15).strokeColor('#999999').lineWidth(1).stroke();

      // 4. Products Table Rows
      y += 23;
      doc.font('Helvetica').fontSize(9);
      for (const item of items) {
        // Handle nested product names
        const productName = item.productId && item.productId.productName 
          ? item.productId.productName 
          : 'Unknown Product';
        
        const sizeColorStr = item.productId && item.productId.size 
          ? ` (${item.productId.size} / ${item.productId.color})` 
          : '';

        doc.text(`${productName}${sizeColorStr}`, 50, y, { width: 200 });
        doc.text(item.quantity.toString(), 260, y, { width: 30, align: 'right' });
        doc.text(item.price.toFixed(2), 305, y, { width: 50, align: 'right' });
        doc.text(`${item.gst}%`, 370, y, { width: 35, align: 'right' });
        doc.text(item.discount.toFixed(2), 420, y, { width: 60, align: 'right' });
        doc.text(item.total.toFixed(2), 495, y, { width: 50, align: 'right' });

        y += 20;

        // Auto-wrap page if content exceeds height
        if (y > 700) {
          doc.addPage();
          y = 50; // Reset Y position on new page
          
          // Reprint headers on new page
          doc.font('Helvetica-Bold').fontSize(9);
          doc.text('Product / Item Name', 50, y);
          doc.text('Qty', 260, y, { width: 30, align: 'right' });
          doc.text('Price (₹)', 305, y, { width: 50, align: 'right' });
          doc.text('GST', 370, y, { width: 35, align: 'right' });
          doc.text('Discount (₹)', 420, y, { width: 60, align: 'right' });
          doc.text('Total (₹)', 495, y, { width: 50, align: 'right' });

          doc.moveTo(50, y + 15).lineTo(545, y + 15).strokeColor('#999999').lineWidth(1).stroke();
          y += 23;
          doc.font('Helvetica').fontSize(9);
        }
      }

      // Border line below rows
      doc.moveTo(50, y).lineTo(545, y).strokeColor('#cccccc').lineWidth(1).stroke();
      y += 15;

      // 5. Summary / Calculations
      doc.font('Helvetica-Bold').fontSize(10);
      
      doc.text('Subtotal:', 340, y);
      doc.font('Helvetica').text(`₹${bill.subtotal.toFixed(2)}`, 470, y, { width: 75, align: 'right' });
      
      y += 18;
      doc.font('Helvetica-Bold').text('GST Tax Total:', 340, y);
      doc.font('Helvetica').text(`₹${bill.gstAmount.toFixed(2)}`, 470, y, { width: 75, align: 'right' });

      y += 18;
      doc.font('Helvetica-Bold').text('Total Discount:', 340, y);
      doc.font('Helvetica').text(`₹${bill.discountAmount.toFixed(2)}`, 470, y, { width: 75, align: 'right' });

      y += 18;
      // Draw grand total line
      doc.moveTo(340, y).lineTo(545, y).strokeColor('#333333').lineWidth(1).stroke();
      y += 7;

      doc.font('Helvetica-Bold').fontSize(11).text('Grand Total:', 340, y);
      doc.fontSize(11).text(`₹${bill.grandTotal.toFixed(2)}`, 470, y, { width: 75, align: 'right' });

      y += 45;
      doc.font('Helvetica-Oblique').fontSize(11).fillColor('#666666').text('Thank you for shopping with FlareMinds Textiles!', 50, y, { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
