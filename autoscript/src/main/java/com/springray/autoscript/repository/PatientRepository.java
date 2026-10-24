package com.springray.autoscript.repository;

import com.springray.autoscript.model.Patient;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PatientRepository extends JpaRepository<Patient, Long> {

    /**
     * Flexible search: any field left as an empty string matches everything, so the caller
     * can mix and match any combination of fields. Non-empty values are matched with a
     * case-insensitive partial (LIKE %…%) match.
     *
     * Partial matches are intentional — typing "Kim" matches "Kimura" and "Kim".
     *
     * NOTE: parameters are passed as empty strings (never null) to avoid PostgreSQL
     * "function lower(bytea) does not exist" errors — when a bind parameter is null,
     * Postgres cannot infer its type and defaults to bytea, which breaks LOWER()/CONCAT().
     * The phone filter additionally guards with a blank check since it strips formatting.
     */
    @Query("""
        SELECT p FROM Patient p
        WHERE
            LOWER(p.firstName) LIKE LOWER(CONCAT('%', :firstName, '%'))
        AND LOWER(p.lastName)  LIKE LOWER(CONCAT('%', :lastName,  '%'))
        AND p.dob              LIKE CONCAT('%', :dob, '%')
        AND (
            :phone = ''
            OR REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(p.phone,''),' ',''),'-',''),'(',''),')','')
               LIKE CONCAT('%', REPLACE(REPLACE(REPLACE(REPLACE(:phone,' ',''),'-',''),'(',''),')',''), '%')
        )
        ORDER BY p.lastName, p.firstName
    """)
    List<Patient> search(
        @Param("firstName") String firstName,
        @Param("lastName")  String lastName,
        @Param("dob")       String dob,
        @Param("phone")     String phone
    );
}
