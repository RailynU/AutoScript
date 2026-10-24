package com.springray.autoscript.service;

import com.springray.autoscript.model.Prescription;
import com.springray.autoscript.repository.PrescriptionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class PrescriptionService {

    private final PrescriptionRepository repo;

    public List<Prescription> findLatest() {
        return repo.findTop50ByOrderByCreatedAtDesc();
    }

    public List<Prescription> findByPatient(Long patientId) {
        return repo.findByPatientIdOrderByCreatedAtDesc(patientId);
    }

    public Optional<Prescription> findById(Long id) {
        return repo.findById(id);
    }

    public List<Prescription> search(String query) {
        if (query == null || query.isBlank()) return findLatest();
        return repo.search(query.trim());
    }

    /** Dashboard stats — counts per status */
    public Map<String, Long> stats() {
        return Map.of(
            "reviewed",   repo.countByStatus("reviewed"),
            "manual",     repo.countByStatus("manual"),
            "cleared",    repo.countByStatus("cleared"),
            "processing", repo.countByStatus("processing")
        );
    }

    @Transactional
    public Prescription create(Prescription prescription) {
        return repo.save(prescription);
    }

    @Transactional
    public Prescription updateStatus(Long id, String status, String substatus) {
        Prescription p = repo.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Prescription not found: " + id));
        p.setStatus(status);
        p.setSubstatus(substatus);
        return repo.save(p);
    }

    @Transactional
    public void delete(Long id) {
        repo.deleteById(id);
    }
}
