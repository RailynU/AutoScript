package com.springray.autoscript.controllers;

import com.springray.autoscript.model.Patient;
import com.springray.autoscript.service.PatientService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/patients")
@RequiredArgsConstructor
public class PatientController {

    private final PatientService service;

    /** GET /api/patients
     *  Optional query params: firstName, lastName, dob, phone
     *  If none provided → returns all patients.
     */
    @GetMapping
    public List<Patient> search(
        @RequestParam(required = false) String firstName,
        @RequestParam(required = false) String lastName,
        @RequestParam(required = false) String dob,
        @RequestParam(required = false) String phone
    ) {
        boolean hasFilter = (firstName != null && !firstName.isBlank())
                         || (lastName  != null && !lastName.isBlank())
                         || (dob       != null && !dob.isBlank())
                         || (phone     != null && !phone.isBlank());

        return hasFilter
            ? service.search(firstName, lastName, dob, phone)
            : service.findAll();
    }

    /** GET /api/patients/{id} */
    @GetMapping("/{id}")
    public ResponseEntity<Patient> getById(@PathVariable Long id) {
        return service.findById(id)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    /** POST /api/patients */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Patient create(@Valid @RequestBody Patient patient) {
        return service.create(patient);
    }

    /** PUT /api/patients/{id} */
    @PutMapping("/{id}")
    public ResponseEntity<Patient> update(@PathVariable Long id,
                                          @Valid @RequestBody Patient patient) {
        try {
            return ResponseEntity.ok(service.update(id, patient));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /** DELETE /api/patients/{id} */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }
}
