package com.springray.autoscript.repository;

import com.springray.autoscript.model.Prescription;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PrescriptionRepository extends JpaRepository<Prescription, Long> {

    /** Latest 50 prescriptions ordered by creation time desc */
    List<Prescription> findTop50ByOrderByCreatedAtDesc();

    /** All prescriptions for a specific patient */
    List<Prescription> findByPatientIdOrderByCreatedAtDesc(Long patientId);

    /** Count by status for dashboard stats */
    long countByStatus(String status);

    /** Search by patient name or rxId */
    @Query("""
        SELECT p FROM Prescription p
        JOIN p.patient pt
        WHERE LOWER(pt.firstName) LIKE LOWER(CONCAT('%',:q,'%'))
           OR LOWER(pt.lastName)  LIKE LOWER(CONCAT('%',:q,'%'))
           OR LOWER(p.rxId)       LIKE LOWER(CONCAT('%',:q,'%'))
           OR LOWER(p.medication) LIKE LOWER(CONCAT('%',:q,'%'))
        ORDER BY p.createdAt DESC
    """)
    List<Prescription> search(@org.springframework.data.repository.query.Param("q") String query);
}
