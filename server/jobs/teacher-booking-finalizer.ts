import { finalizeDueStudentTeacherBookings } from "../storage/teacher-booking.storage";
import { withDatabaseMutationPermit } from "../services/database-mutation-permit.service";
import { teacherBookingSchemaIsReady } from "../storage/teacher-booking-schema";

let started = false;
let running = false;
let schemaWarningLogged = false;

async function runFinalizerTick() {
  if (running) return;
  running = true;
  try {
    if (!(await teacherBookingSchemaIsReady())) {
      if (!schemaWarningLogged) {
        console.warn("[TeacherBooking] Finalizer is waiting for the booking schema to be applied.");
        schemaWarningLogged = true;
      }
      return;
    }
    schemaWarningLogged = false;
    await withDatabaseMutationPermit(async () => {
      const result = await finalizeDueStudentTeacherBookings();
      if (result.finalized > 0) {
        console.info(`[TeacherBooking] Finalized ${result.finalized}/${result.due} due sessions.`);
      }
    });
  } catch (error: any) {
    console.error("[TeacherBooking] Finalizer tick failed:", error?.message ?? error);
  } finally {
    running = false;
  }
}

export function startTeacherBookingFinalizer() {
  if (started) return;
  started = true;
  setTimeout(() => void runFinalizerTick(), 10_000);
  setInterval(() => void runFinalizerTick(), 60_000);
  console.info("[TeacherBooking] Session finalizer started (60-second interval).");
}
