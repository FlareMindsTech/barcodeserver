const VALID_GST = [0, 5, 12, 18, 28];

const VALID_SIZES = [
    "XS",
    "S",
    "M",
    "L",
    "XL",
    "XXL",
    "3XL",
    "4XL",
    "5XL"
];

// ===============================
// Convert Text to Title Case
// ===============================

const titleCase = (text = "") => {
    return text
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());
};

// ===============================
// Validation Function
// ===============================

export const validateProduct = (body) => {

    // ------------------------------
    // Format Data
    // ------------------------------

    body.productName = titleCase(body.productName);
    body.category = titleCase(body.category);
    body.brand = titleCase(body.brand);

    body.description = body.description?.trim() || "";
    body.hsnCode = body.hsnCode?.trim() || "";

    // ------------------------------
    // Product Name
    // ------------------------------

    if (!body.productName)
        return { status: false, message: "Product Name is required." };

    if (body.productName.length < 3)
        return { status: false, message: "Product Name should contain minimum 3 characters." };

    if (body.productName.length > 100)
        return { status: false, message: "Product Name should not exceed 100 characters." };

    // ------------------------------
    // Category
    // ------------------------------

    if (!body.category)
        return { status: false, message: "Category is required." };

    // ------------------------------
    // Brand
    // ------------------------------

    if (!body.brand)
        return { status: false, message: "Brand is required." };

    // ------------------------------
    // GST
    // ------------------------------

    if (!VALID_GST.includes(body.gstPercentage))
        return {
            status: false,
            message: "Invalid GST Percentage."
        };

    // ------------------------------
    // HSN
    // ------------------------------

    if (body.hsnCode !== "") {

        if (!/^[0-9]{4,8}$/.test(body.hsnCode)) {

            return {
                status: false,
                message: "Invalid HSN Code."
            };

        }

    }

    // ------------------------------
    // Variants
    // ------------------------------

    if (!Array.isArray(body.variants))
        return {
            status: false,
            message: "Variants should be an array."
        };

    if (body.variants.length === 0)
        return {
            status: false,
            message: "At least one variant is required."
        };

    const barcodeSet = new Set();

    const variantSet = new Set();

    // ------------------------------
    // Variant Validation
    // ------------------------------

    for (const variant of body.variants) {

        variant.barcode = variant.barcode?.trim().toUpperCase();

        variant.size = variant.size?.trim().toUpperCase();

        variant.color = titleCase(variant.color);

        // Barcode

        if (!variant.barcode)
            return {
                status: false,
                message: "Barcode is required."
            };

        if (!/^[A-Z0-9_-]+$/.test(variant.barcode))
            return {
                status: false,
                message: `Invalid Barcode : ${variant.barcode}`
            };

        if (barcodeSet.has(variant.barcode))
            return {
                status: false,
                message: `Duplicate Barcode : ${variant.barcode}`
            };

        barcodeSet.add(variant.barcode);

        // Size

        if (!VALID_SIZES.includes(variant.size))
            return {
                status: false,
                message: `Invalid Size : ${variant.size}`
            };

        // Color

        if (!variant.color)
            return {
                status: false,
                message: "Color is required."
            };

        if (!/^[A-Za-z ]+$/.test(variant.color))
            return {
                status: false,
                message: `Invalid Color : ${variant.color}`
            };

        // Duplicate Variant

        const variantKey = `${variant.size}-${variant.color}`;

        if (variantSet.has(variantKey))
            return {
                status: false,
                message: `Duplicate Variant : ${variantKey}`
            };

        variantSet.add(variantKey);

        // Purchase Price

        if (variant.purchasePrice <= 0)
            return {
                status: false,
                message: "Purchase Price should be greater than zero."
            };

        // Selling Price

        if (variant.sellingPrice <= 0)
            return {
                status: false,
                message: "Selling Price should be greater than zero."
            };

        if (variant.sellingPrice < variant.purchasePrice)
            return {
                status: false,
                message: `Selling Price should not be less than Purchase Price (${variant.barcode})`
            };

        // Stock

        if (variant.stock < 0)
            return {
                status: false,
                message: "Stock cannot be negative."
            };

    }

    return {
        status: true
    };

};