import { db } from "./db";
import { users, locations, staff, departments, roles, staffAssignments } from "@shared/schema";
import { hashPassword } from "./auth";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Seeding database...");
  
  // 1. Create main location
  const [existingLocation] = await db.select().from(locations).where(eq(locations.code, "MAIN"));
  let mainLocationId = existingLocation?.id;
  
  if (!mainLocationId) {
    console.log("Creating main location...");
    const [newLoc] = await db.insert(locations).values({
      name: "Cơ sở chính",
      code: "MAIN",
      address: "123 Đường ABC, Quận XYZ, TP.HCM",
      phone: "0123456789",
      isMain: true,
      isActive: true
    }).returning();
    mainLocationId = newLoc.id;
  }
  
  // 2. Seed default departments and roles (check first to avoid duplicates)
  console.log("Seeding departments and roles...");
  
  let [existingDeptCustomer] = await db.select().from(departments).where(eq(departments.name, "Phòng Khách hàng"));
  if (!existingDeptCustomer) {
    const [newDeptCustomer] = await db.insert(departments).values({
      name: "Phòng Khách hàng",
      isSystem: true,
    }).returning();
    existingDeptCustomer = newDeptCustomer;
    await db.insert(roles).values([
      { name: "Học viên", departmentId: newDeptCustomer.id, isSystem: true },
      { name: "Phụ huynh", departmentId: newDeptCustomer.id, isSystem: true },
    ]);
  }

  let [existingDeptTraining] = await db.select().from(departments).where(eq(departments.name, "Phòng Đào tạo"));
  if (!existingDeptTraining) {
    const [newDeptTraining] = await db.insert(departments).values({
      name: "Phòng Đào tạo",
      isSystem: true,
    }).returning();
    existingDeptTraining = newDeptTraining;
    await db.insert(roles).values([
      { name: "Giáo viên", departmentId: newDeptTraining.id, isSystem: true },
      { name: "Trợ giảng", departmentId: newDeptTraining.id, isSystem: true },
    ]);
  }

  // 3. Create admin user
  const [existingAdmin] = await db.select().from(users).where(eq(users.username, "admin"));
  
  if (!existingAdmin) {
    console.log("Creating admin user...");
    const passwordHash = hashPassword("admin123");
    const [adminUser] = await db.insert(users).values({
      username: "admin",
      passwordHash,
      isActive: true
    }).returning();
    
    // Create staff profile for admin
    const [adminStaff] = await db.insert(staff).values({
      userId: adminUser.id,
      fullName: "System Administrator",
      code: "ADMIN-01",
      status: "Hoạt động"
    }).returning();

    // Assign to main location
    await db.insert(staffAssignments).values({
      staffId: adminStaff.id,
      locationId: mainLocationId,
    });
    
    console.log("Admin user created.");
  } else {
    console.log("Admin user already exists.");
  }
  
  console.log("Seeding complete.");
  process.exit(0);
}

seed().catch(err => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
