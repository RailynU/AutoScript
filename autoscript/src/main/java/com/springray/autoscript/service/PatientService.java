package com.springray.autoscript.service;

import com.springray.autoscript.model.Patient;
import com.springray.autoscript.repository.PatientRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class PatientService {

    private final PatientRepository repo;

    /** Return all patients (for listing / pagination later). */
    public List<Patient> findAll() {
        return repo.findAll();
    }

    /** Get a single patient by ID. */
    public Optional<Patient> findById(Long id) {
        return repo.findById(id);
    }

    /**
     * Flexible search — any combination of fields.
     * Blank fields match everything so partial queries work naturally.
     */
    public List<Patient> search(String firstName, String lastName, String dob, String phone) {
        // Pass empty strings (never null) — an empty LIKE '%%' matches every row,
        // and avoids PostgreSQL's null-parameter type-inference error.
        return repo.search(
            clean(firstName),
            clean(lastName),
            clean(dob),
            clean(phone)
        );
    }

    /** Create a new patient record. */
    @Transactional
    public Patient create(Patient patient) {
        return repo.save(patient);
    }

    /** Update an existing patient record. */
    @Transactional
    public Patient update(Long id, Patient updated) {
        Patient existing = repo.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Patient not found: " + id));
        existing.setFirstName(updated.getFirstName());
        existing.setLastName(updated.getLastName());
        existing.setDob(updated.getDob());
        existing.setPhone(updated.getPhone());
        existing.setEmail(updated.getEmail());
        existing.setAddress(updated.getAddress());
        existing.setNotes(updated.getNotes());
        return repo.save(existing);
    }

    /** Delete a patient by ID. */
    @Transactional
    public void delete(Long id) {
        repo.deleteById(id);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private static String clean(String s) {
        return (s == null) ? "" : s.trim();
    }
}
