const xlsx = require('xlsx');

// 1. قراءة الملف الأصلي
const workbook = xlsx.readFile('souq-el-obour-products (1).xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet);

// 2. قواميس تصنيف الماركات والأقسام
const brandsMap = {
    "كوكاكولا": ["كوكاكولا", "coca cola", "coca-cola", "sprite", "سبرايت", "فانتا", "fanta", "dasani", "داساني"],
    "بيبسي": ["بيبسي", "pepsi", "7up", "سفن اب", "ميراندا", "mirinda", "aquafina", "اكوافينا", "شويبس"],
    "جهينة": ["جهينة", "juhayna"],
    "المراعي": ["المراعي", "almarai", "beyti", "بيتي"],
    "شيبسي": ["شيبسي", "chipsy", "doritos", "دوريتوس", "cheetos", "شيتوس", "sunbites", "صن بايتس", "tiger", "تايجر"],
    "اندومي": ["اندومي", "indomie"],
    "ليبتون": ["ليبتون", "lipton"],
    "العروسة": ["العروسة"],
    "نسكافيه": ["نسكافيه", "nescafe"],
    "دريم": ["دريم", "dream"],
    "هاينز": ["هاينز", "heinz"],
    "فاين": ["فاين", "fine", "zeina", "زينة"],
    "بامبرز": ["بامبرز", "pampers", "molfix", "مولفيكس"],
    "اريال": ["اريال", "ariel", "persil", "برسيل", "oxi", "اوكسي"],
    "فيري": ["فيري", "fairy", "pril", "بريل"],
    "دوف": ["دوف", "dove", "sunsilk", "صانسيلك", "clear", "كلير", "pantene", "بانتين"],
    "كادبوري": ["كادبوري", "cadbury", "galaxy", "جالكسي", "milka", "ميلكا", "مورو", "moro", "kinder", "كيندر"],
    "مارس": ["مارس", "mars", "snickers", "سنيكرز", "twix", "تويكس", "bounty", "باونتي"],
    "ماجي": ["ماجي", "maggi", "knorr", "كنور"],
    "الضحى": ["الضحى", "الضحي", "eldoha", "el doha"],
    "كريستال": ["كريستال", "crystal", "afia", "عافية"],
    "حلواني": ["حلواني", "halwani", "americana", "امريكانا", "koki", "كوكي", "atyab", "اطياب"],
    "لمتنا": ["لمتنا", "lametna", "italiano", "ايطاليانو", "star", "ستار", "el maleka", "الملكة"],
    "دومتي": ["دومتي", "domty", "obour land", "عبور لاند", "lactel", "لاكتيل"],
    "انرجايزر": ["انرجايزر", "energizer"]
};

const categoryMap = {
    "مشروبات وعصائر": ["عصير", "مياه", "بيبسي", "كوكاكولا", "شويبس", "مشروب", "عصير", "juice", "water", "drink", "soda", "cola", "سبرايت", "فانتا", "سفن اب", "red bull", "ريد بول", "فيروز", "بريل"],
    "ألبان وأجبان": ["جبن", "لبن", "حليب", "زبادي", "زبدة", "قشطة", "milk", "cheese", "yogurt", "butter", "جهينة", "المراعي", "دومتي", "عبور لاند", "لاكتيل", "رومي", "فلامنك"],
    "بقالة أساسية": ["ارز", "أرز", "سكر", "زيت", "مكرونة", "دقيق", "سمن", "خل", "ملح", "rice", "sugar", "oil", "pasta", "flour", "ghee", "الضحى", "كريستال", "لمتنا", "الملكة"],
    "تسالي وحلويات": ["شيبسي", "شوكولاتة", "بسكويت", "كيك", "لب", "سوداني", "شوكولاته", "chips", "chocolate", "biscuit", "cake", "كادبوري", "جالكسي", "دوريتوس", "شيتوس", "hohos", "lambada", "byluck", "بونبون"],
    "شاي وقهوة": ["شاي", "قهوة", "نسكافيه", "بن", "tea", "coffee", "nescafe", "ليبتون", "العروسة"],
    "معلبات وصلصات": ["صلصة", "تونة", "فول", "طحينة", "كاتشب", "مايونيز", "تونه", "sauce", "tuna", "ketchup", "mayonnaise", "هاينز", "قها", "عسل", "مربى"],
    "لحوم ودواجن": ["لحم", "فراخ", "دجاج", "برجر", "سجق", "بانيه", "meat", "chicken", "burger", "sausage", "كوكي", "امريكانا", "اطياب", "بسطرمة", "لانشون"],
    "خضار وفاكهة": ["طماطم", "بطاطس", "بصل", "تفاح", "موز", "عنب", "برتقال", "خيار", "فلفل", "tomato", "potato", "onion", "apple", "banana", "orange", "مانجو"],
    "منظفات وعناية شخصية": ["صابون", "شامبو", "مسحوق", "معجون", "مناديل", "حفاضات", "فوط", "غسول", "شاور", "soap", "shampoo", "detergent", "tissue", "diaper", "فاين", "اريال", "برسيل", "اوكسي", "بامبرز", "lux", "garnier", "pantene", "ورق"],
    "أدوات منزلية وكهربائية": ["حجر", "قلم", "بطارية", "لمبة", "سلك", "مشترك", "battery", "bulb", "cable", "انرجايزر", "fork"],
    "منتجات آسيوية مستوردة": ["chinese", "korean", "asian", "noodle", "ramen", "soy sauce", "tofu", "صيني", "كوري", "اندومي", "indomie", "paste", "bamboo", "chopsticks", "wasabi", "sushi", "konjac"],
    "مخبوزات": ["خبز", "عيش", "فينو", "كرواسون", "باتيه", "bread", "croissant"]
};

// 3. معالجة البيانات وتصنيفها
const processedData = data.map(item => {
    const name = (item.Name || "").toString().toLowerCase();
    let assignedCategory = "عام";
    
    // التعديل هنا: جعل الماركة الافتراضية "عام"
    let assignedBrand = "عام"; 

    // تحديد الماركة
    for (const [brand, keywords] of Object.entries(brandsMap)) {
        if (keywords.some(kw => name.includes(kw.toLowerCase()))) {
            assignedBrand = brand;
            break;
        }
    }

    // تحديد القسم
    let foundCategory = false;
    for (const [category, keywords] of Object.entries(categoryMap)) {
        if (keywords.some(kw => name.includes(kw.toLowerCase()))) {
            assignedCategory = category;
            foundCategory = true;
            break;
        }
    }

    // تصنيفات إضافية ذكية
    if (!foundCategory) {
        if (name.includes("نودلز") || name.includes("صويا") || name.includes("bean paste") || name.includes("bamboo")) {
            assignedCategory = "منتجات آسيوية مستوردة";
        } else if (name.includes("حجر") || name.includes("بطارية")) {
            assignedCategory = "أدوات منزلية وكهربائية";
        }
    }

    // إرجاع المنتج بالبيانات الجديدة (مع إزالة كود WooCommerce إذا كان موجوداً)
    delete item.WooCommerce_ID; 
    return {
        ...item,
        Category: assignedCategory,
        Brand: assignedBrand
    };
});

// 4. إنشاء الملف الجديد
const newSheet = xlsx.utils.json_to_sheet(processedData);
const newWorkbook = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(newWorkbook, newSheet, "Products");
xlsx.writeFile(newWorkbook, "souq-el-obour-updated.xlsx");

console.log(`✅ تم تحليل وتحديث ${processedData.length} منتج بنجاح! تم إنشاء ملف souq-el-obour-updated.xlsx`);