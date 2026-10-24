package com.springray.autoscript.config;

import com.springray.autoscript.model.Patient;
import com.springray.autoscript.model.Prescription;
import com.springray.autoscript.repository.PatientRepository;
import com.springray.autoscript.repository.PrescriptionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.LocalDateTime;
import java.util.List;

@Configuration
@RequiredArgsConstructor
@Slf4j
public class DataSeeder {

    private final PatientRepository     patientRepo;
    private final PrescriptionRepository prescriptionRepo;

    @Bean
    CommandLineRunner seedData() {
        return args -> {
            if (patientRepo.count() > 0) {
                log.info("Database already seeded — skipping.");
                return;
            }
            log.info("Seeding demo data…");

            // ── Patients ────────────────────────────────────────────────────
            List<Patient> patients = patientRepo.saveAll(List.of(
                p("Emily",    "Carter",    "04/12/1985", "(555) 123-4567", "emily.carter@email.com",    "123 Oak St, Austin TX",     null),
                p("Michael",  "Chen",      "11/03/1978", "(555) 987-6543", "m.chen@email.com",          "456 Pine Ave, Houston TX",  null),
                p("Sarah",    "Johnson",   "07/21/1990", "(555) 456-7890", "sarah.j@email.com",         "789 Elm Rd, Dallas TX",     null),
                p("David",    "Kim",       "01/18/1965", "(555) 310-1122", "d.kim@email.com",           "12 Cedar Ln, San Antonio",  null),
                p("Lisa",     "Patel",     "09/30/1972", "(555) 221-3344", "lisa.patel@email.com",      "34 Birch Blvd, Plano TX",   null),
                p("James",    "Wilson",    "02/14/1988", "(555) 445-6677", "j.wilson@email.com",        "56 Maple Dr, Irving TX",    null),
                p("Maria",    "Garcia",    "06/25/1991", "(555) 667-8899", "maria.g@email.com",         "78 Walnut St, Garland TX",  null),
                p("Robert",   "Thompson",  "12/11/1958", "(555) 889-0011", "r.thompson@email.com",      "90 Spruce Ave, Frisco TX",  null),
                p("Jennifer", "Lee",       "03/03/1980", "(555) 001-2233", "j.lee@email.com",           "11 Aspen Ct, McKinney TX",  null),
                p("Carlos",   "Rodriguez", "05/17/1995", "(555) 112-3344", "carlos.r@email.com",        "22 Oak Hill, Denton TX",    null),
                // Shared-phone scenario: mother + daughter use same number
                p("Rosa",     "Jackson",   "03/14/1965", "(555) 543-9900", "rosa.jackson@email.com",    "14 Sycamore St, Waco TX",   "Parent contact for Sophia Jackson"),
                p("Sophia",   "Jackson",   "08/22/2002", "(555) 543-9900", null,                        "14 Sycamore St, Waco TX",   "No personal phone — uses parent contact"),
                // Twin scenario: same DOB
                p("Daniel",   "Kim",       "01/18/1965", "(555) 310-9988", "daniel.kim@email.com",      "99 River Rd, Austin TX",    "Twin brother of David Kim"),
                p("Angela",   "Martinez",  "07/04/1982", "(555) 234-5678", "angela.m@email.com",        "33 Valley Dr, Lubbock TX",  null),
                p("Kevin",    "Harris",    "10/30/1970", "(555) 345-6789", "kevin.h@email.com",         "55 Ridge Rd, Amarillo TX",  null)
            ));

            // ── Prescriptions ────────────────────────────────────────────────
            LocalDateTime base = LocalDateTime.now().withHour(11).withMinute(0).withSecond(0);

            prescriptionRepo.saveAll(List.of(
                rx(patients.get(0),  "Lisinopril 10mg",     "1 tablet daily",         "Take in the morning with water",         "reviewed",   null,                           "Dr. A. Nguyen",   base.minusMinutes(18)),
                rx(patients.get(1),  "Metformin 500mg",     "2 tablets twice daily",  "Take with meals",                        "manual",     "Allergy flag — review needed", "Dr. B. Clark",    base.minusMinutes(32)),
                rx(patients.get(2),  "Atorvastatin 20mg",   "1 tablet at bedtime",    "Avoid grapefruit juice",                 "cleared",    null,                           "Dr. C. Wright",   base.minusMinutes(45)),
                rx(patients.get(3),  "Amoxicillin 500mg",   "1 capsule three times",  "Complete full 10-day course",            "processing", "Analyzing interactions…",       "Dr. D. Hall",     base.minusMinutes(64)),
                rx(patients.get(4),  "Omeprazole 20mg",     "1 capsule before meal",  "Take 30 min before breakfast",           "cleared",    null,                           "Dr. E. Adams",    base.minusMinutes(87)),
                rx(patients.get(5),  "Sertraline 50mg",     "1 tablet daily",         "Take at the same time each day",         "reviewed",   null,                           "Dr. F. Baker",    base.minusMinutes(108)),
                rx(patients.get(6),  "Metoprolol 25mg",     "1 tablet twice daily",   "Do not stop abruptly",                   "manual",     "Dose review requested",        "Dr. G. Nelson",   base.minusMinutes(133)),
                rx(patients.get(7),  "Amlodipine 5mg",      "1 tablet daily",         "Monitor blood pressure weekly",          "processing", "Running safety checks…",        "Dr. H. Carter",   base.minusMinutes(159)),
                rx(patients.get(8),  "Levothyroxine 50mcg", "1 tablet on empty stomach", "Take 30-60 min before breakfast",    "cleared",    null,                           "Dr. I. Mitchell", base.minusMinutes(182)),
                rx(patients.get(9),  "Albuterol inhaler",   "2 puffs as needed",      "Shake well before each use",             "reviewed",   null,                           "Dr. J. Perez",    base.minusMinutes(204)),
                rx(patients.get(10), "Warfarin 5mg",        "1 tablet daily",         "INR check in 2 weeks",                   "manual",     "Drug interaction detected",    "Dr. K. Roberts",  base.minusMinutes(227)),
                rx(patients.get(11), "Cetirizine 10mg",     "1 tablet at bedtime",    "May cause drowsiness",                   "cleared",    null,                           "Dr. L. Turner",   base.minusMinutes(251)),
                rx(patients.get(12), "Ibuprofen 400mg",     "1 tablet every 6 hours", "Take with food. Max 3 days.",            "reviewed",   null,                           "Dr. M. Phillips", base.minusMinutes(274)),
                rx(patients.get(13), "Hydrochlorothiazide", "1 tablet daily",         "Take in the morning",                    "cleared",    null,                           "Dr. N. Evans",    base.minusMinutes(298)),
                rx(patients.get(14), "Gabapentin 300mg",    "1 capsule three times",  "Do not drive until effect is known",     "processing", "Checking interactions…",        "Dr. O. Collins",  base.minusMinutes(321)),
                // A few more to fill the dashboard
                rx(patients.get(0),  "Aspirin 81mg",        "1 tablet daily",         "Take with food",                         "cleared",    null,                           "Dr. A. Nguyen",   base.minusMinutes(344)),
                rx(patients.get(2),  "Vitamin D3 2000IU",   "1 tablet daily",         "Take with a fatty meal",                 "reviewed",   null,                           "Dr. C. Wright",   base.minusMinutes(367)),
                rx(patients.get(5),  "Losartan 50mg",       "1 tablet daily",         "Monitor potassium levels",               "manual",     "Missing lab context",          "Dr. F. Baker",    base.minusMinutes(390))
            ));

            log.info("Seeded {} patients and {} prescriptions.",
                patientRepo.count(), prescriptionRepo.count());
        };
    }

    private static Patient p(String fn, String ln, String dob, String phone,
                              String email, String address, String notes) {
        return Patient.builder()
            .firstName(fn).lastName(ln).dob(dob).phone(phone)
            .email(email).address(address).notes(notes).build();
    }

    private static Prescription rx(Patient patient, String med, String dosage,
                                    String instructions, String status, String substatus,
                                    String prescriber, LocalDateTime createdAt) {
        return Prescription.builder()
            .patient(patient).medication(med).dosage(dosage)
            .instructions(instructions).status(status).substatus(substatus)
            .prescriber(prescriber).createdAt(createdAt).build();
    }
}
