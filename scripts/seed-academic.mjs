import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const client = new pg.Client({ connectionString });
await client.connect();

const COLLEGES = [
  { key: "medicine", nameAr: "كلية الطب البشري", nameEn: "Faculty of Medicine", years: 6 },
  { key: "dentistry", nameAr: "كلية طب الأسنان", nameEn: "Faculty of Dentistry", years: 5 },
  { key: "pharmacy", nameAr: "كلية الصيدلة", nameEn: "Faculty of Pharmacy", years: 5 },
  { key: "vet", nameAr: "كلية الطب البيطري", nameEn: "Faculty of Veterinary Medicine", years: 5 },
  { key: "physiotherapy", nameAr: "كلية العلاج الطبيعي", nameEn: "Faculty of Physical Therapy", years: 5 },
  { key: "engineering", nameAr: "كلية الهندسة", nameEn: "Faculty of Engineering", years: 4 },
  { key: "computers", nameAr: "كلية الحاسبات والذكاء الاصطناعي", nameEn: "Faculty of Computers and Artificial Intelligence", years: 4 },
  { key: "science", nameAr: "كلية العلوم", nameEn: "Faculty of Science", years: 4 },
  { key: "agriculture", nameAr: "كلية الزراعة", nameEn: "Faculty of Agriculture", years: 4 },
  { key: "nursing", nameAr: "كلية التمريض", nameEn: "Faculty of Nursing", years: 4 },
  { key: "law", nameAr: "كلية الحقوق", nameEn: "Faculty of Law", years: 4 },
  { key: "commerce", nameAr: "كلية التجارة", nameEn: "Faculty of Commerce", years: 4 },
  { key: "arts", nameAr: "كلية الآداب", nameEn: "Faculty of Arts", years: 4 },
  { key: "education", nameAr: "كلية التربية", nameEn: "Faculty of Education", years: 4 },
  { key: "alsun", nameAr: "كلية الألسن", nameEn: "Faculty of Al-Alsun (Languages)", years: 4 },
  { key: "dar_uloom", nameAr: "كلية دار العلوم", nameEn: "Faculty of Dar Al-Uloom", years: 4 },
  { key: "media", nameAr: "كلية الإعلام", nameEn: "Faculty of Mass Communication", years: 4 },
  { key: "econ_poli", nameAr: "كلية الاقتصاد والعلوم السياسية", nameEn: "Faculty of Economics and Political Science", years: 4 },
  { key: "fine_arts", nameAr: "كلية الفنون الجميلة", nameEn: "Faculty of Fine Arts", years: 5 },
  { key: "phys_edu", nameAr: "كلية التربية الرياضية", nameEn: "Faculty of Physical Education", years: 4 },
  { key: "tourism", nameAr: "كلية السياحة والفنادق", nameEn: "Faculty of Tourism and Hotels", years: 4 },
  { key: "social_work", nameAr: "كلية الخدمة الاجتماعية", nameEn: "Faculty of Social Work", years: 4 },
  { key: "specific_edu", nameAr: "كلية التربية النوعية", nameEn: "Faculty of Specific Education", years: 4 },
];

const CORE = ["arts", "science", "commerce", "law", "education"];

const FLAGSHIP = {
  "جامعة القاهرة|Cairo University": [
    "medicine", "dentistry", "pharmacy", "vet", "engineering", "computers",
    "science", "agriculture", "nursing", "law", "commerce", "arts",
    "education", "alsun", "dar_uloom", "media", "econ_poli", "fine_arts",
    "phys_edu", "tourism", "social_work", "specific_edu", "physiotherapy",
  ],
  "جامعة عين شمس|Ain Shams University": [
    "medicine", "dentistry", "pharmacy", "vet", "engineering", "computers",
    "science", "agriculture", "nursing", "law", "commerce", "arts",
    "education", "alsun", "media", "specific_edu",
  ],
  "جامعة الإسكندرية|Alexandria University": [
    "medicine", "dentistry", "pharmacy", "vet", "engineering", "computers",
    "science", "agriculture", "nursing", "law", "commerce", "arts",
    "education", "fine_arts", "tourism", "phys_edu",
  ],
  "جامعة المنصورة|Mansoura University": [
    "medicine", "dentistry", "pharmacy", "vet", "engineering", "computers",
    "science", "agriculture", "nursing", "law", "commerce", "arts", "education",
  ],
  "جامعة الزقازيق|Zagazig University": [
    "medicine", "dentistry", "pharmacy", "vet", "engineering", "computers",
    "science", "agriculture", "nursing", "law", "commerce", "arts", "education",
  ],
  "جامعة طنطا|Tanta University": [
    "medicine", "dentistry", "pharmacy", "engineering", "computers",
    "science", "agriculture", "nursing", "law", "commerce", "arts", "education",
  ],
  "جامعة أسيوط|Assiut University": [
    "medicine", "dentistry", "pharmacy", "vet", "engineering", "computers",
    "science", "agriculture", "nursing", "law", "commerce", "arts", "education",
  ],
  "جامعة حلوان|Helwan University": [
    "medicine", "pharmacy", "engineering", "computers", "commerce", "arts",
    "education", "fine_arts", "tourism", "social_work", "specific_edu",
  ],
  "جامعة الأزهر|Al-Azhar University": [
    "medicine", "dentistry", "pharmacy", "engineering", "commerce",
    "law", "education",
  ],
};

const OTHER_PUBLIC_UNIVERSITIES = [
  "جامعة المنوفية|Menoufia University",
  "جامعة بنها|Benha University",
  "جامعة الفيوم|Fayoum University",
  "جامعة بني سويف|Beni Suef University",
  "جامعة المنيا|Minya University",
  "جامعة سوهاج|Sohag University",
  "جامعة جنوب الوادي|South Valley University",
  "جامعة أسوان|Aswan University",
  "جامعة قناة السويس|Suez Canal University",
  "جامعة كفر الشيخ|Kafr El-Sheikh University",
  "جامعة دمياط|Damietta University",
  "جامعة دمنهور|Damanhour University",
  "جامعة السادات|Sadat City University",
  "جامعة الوادي الجديد|New Valley University",
  "جامعة مطروح|Matrouh University",
  "جامعة العريش|Al-Arish University",
  "جامعة الأقصر|Luxor University",
  "جامعة بورسعيد|Port Said University",
  "جامعة السويس|Suez University",
  "جامعة الإسماعيلية التكنولوجية|Ismailia Technological University",
];

function yearName(n) {
  const ar = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة"];
  const en = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth"];
  return { nameAr: `السنة ${ar[n - 1]}`, nameEn: `${en[n - 1]} Year` };
}

async function getOrCreateCollege(key) {
  const c = COLLEGES.find((x) => x.key === key);
  const existing = await client.query("SELECT id FROM colleges WHERE name_ar=$1", [c.nameAr]);
  if (existing.rows[0]) return existing.rows[0].id;
  const inserted = await client.query(
    "INSERT INTO colleges (name_ar,name_en,sort_order) VALUES ($1,$2,$3) RETURNING id",
    [c.nameAr, c.nameEn, COLLEGES.indexOf(c)],
  );
  return inserted.rows[0].id;
}

async function addUniversity(collegeId, nameAr, nameEn, yearsCount) {
  const res = await client.query(
    `INSERT INTO universities (college_id,name_ar,name_en,sort_order)
     VALUES ($1,$2,$3,0)
     ON CONFLICT (college_id, name_ar) DO UPDATE SET name_en=EXCLUDED.name_en
     RETURNING id`,
    [collegeId, nameAr, nameEn],
  );
  const universityId = res.rows[0].id;
  for (let n = 1; n <= yearsCount; n++) {
    const { nameAr: yAr, nameEn: yEn } = yearName(n);
    await client.query(
      `INSERT INTO academic_years (university_id,year_number,name_ar,name_en)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (university_id, year_number) DO NOTHING`,
      [universityId, n, yAr, yEn],
    );
  }
  return universityId;
}

try {
  await client.query("BEGIN");

  const collegeIdByKey = {};
  for (const c of COLLEGES) collegeIdByKey[c.key] = await getOrCreateCollege(c.key);

  let universitiesCreated = 0;

  for (const [label, collegeKeys] of Object.entries(FLAGSHIP)) {
    const [nameAr, nameEn] = label.split("|");
    for (const key of collegeKeys) {
      const college = COLLEGES.find((c) => c.key === key);
      await addUniversity(collegeIdByKey[key], nameAr, nameEn, college.years);
      universitiesCreated++;
    }
  }

  for (const label of OTHER_PUBLIC_UNIVERSITIES) {
    const [nameAr, nameEn] = label.split("|");
    for (const key of CORE) {
      const college = COLLEGES.find((c) => c.key === key);
      await addUniversity(collegeIdByKey[key], nameAr, nameEn, college.years);
      universitiesCreated++;
    }
  }

  await client.query("COMMIT");
  console.log(`Done: ${COLLEGES.length} colleges, ${universitiesCreated} university-college rows, with academic years for each.`);
} catch (error) {
  await client.query("ROLLBACK");
  console.error("Seed academic error:", error);
  process.exitCode = 1;
} finally {
  await client.end();
}
