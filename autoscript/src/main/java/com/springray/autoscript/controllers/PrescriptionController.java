package com.springray.autoscript.controllers;

import com.springray.autoscript.model.Patient;
import com.springray.autoscript.model.Prescription;
import com.springray.autoscript.service.PatientService;
import com.springray.autoscript.service.PrescriptionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/prescriptions")
@RequiredArgsConstructor
public class PrescriptionController {

    private final PrescriptionService prescriptionService;
    private final PatientService      patientService;

    /** GET /api/prescriptions?q=   (search or list latest 50) */
    @GetMapping
    public List<PrescriptionDTO> list(@RequestParam(required = false) String q) {
        return prescriptionService.search(q).stream()
            .map(PrescriptionDTO::from)
            .toList();
    }

    /** GET /api/prescriptions/stats */
    @GetMapping("/stats")
    public Map<String, Long> stats() {
        return prescriptionService.stats();
    }

    /** GET /api/prescriptions/{id} */
    @GetMapping("/{id}")
    public ResponseEntity<PrescriptionDTO> getById(@PathVariable Long id) {
        return prescriptionService.findById(id)
            .map(PrescriptionDTO::from)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    /** GET /api/prescriptions/patient/{patientId} */
    @GetMapping("/patient/{patientId}")
    public List<PrescriptionDTO> byPatient(@PathVariable Long patientId) {
        return prescriptionService.findByPatient(patientId).stream()
            .map(PrescriptionDTO::from)
            .toList();
    }

    /** POST /api/prescriptions  — body: { patientId, medication, dosage, instructions, prescriber } */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ResponseEntity<?> create(@RequestBody CreatePrescriptionRequest req) {
        Patient patient = patientService.findById(req.patientId()).orElse(null);
        if (patient == null)
            return ResponseEntity.badRequest().body("Patient not found: " + req.patientId());

        Prescription p = Prescription.builder()
            .patient(patient)
            .medication(req.medication())
            .dosage(req.dosage())
            .instructions(req.instructions())
            .prescriber(req.prescriber())
            .status("processing")
            .substatus("Analyzing interactions…")
            .build();

        return ResponseEntity.status(HttpStatus.CREATED).body(PrescriptionDTO.from(prescriptionService.create(p)));
    }

    /** PATCH /api/prescriptions/{id}/status  — body: { status, substatus } */
    @PatchMapping("/{id}/status")
    public ResponseEntity<PrescriptionDTO> updateStatus(
            @PathVariable Long id,
            @RequestBody UpdateStatusRequest req) {
        try {
            return ResponseEntity.ok(PrescriptionDTO.from(
                prescriptionService.updateStatus(id, req.status(), req.substatus())));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /** DELETE /api/prescriptions/{id} */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        prescriptionService.delete(id);
    }

    // ── DTOs ────────────────────────────────────────────────────────────────

    public record PrescriptionDTO(
        Long   id,
        String rxId,
        Long   patientId,
        String patientName,
        String patientDob,
        String medication,
        String dosage,
        String instructions,
        String status,
        String substatus,
        String prescriber,
        String createdAt
    ) {
        static PrescriptionDTO from(Prescription p) {
            return new PrescriptionDTO(
                p.getId(), p.getRxId(),
                p.getPatient().getId(),
                p.getPatient().getFullName(),
                p.getPatient().getDob(),
                p.getMedication(), p.getDosage(), p.getInstructions(),
                p.getStatus(), p.getSubstatus(), p.getPrescriber(),
                p.getCreatedAt() != null ? p.getCreatedAt().toString() : null
            );
        }
    }

    public record CreatePrescriptionRequest(
        Long   patientId,
        String medication,
        String dosage,
        String instructions,
        String prescriber
    ) {}

    public record UpdateStatusRequest(String status, String substatus) {}
}
