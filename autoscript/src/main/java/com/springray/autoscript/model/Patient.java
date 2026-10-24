package com.springray.autoscript.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "patients")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Patient {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotBlank(message = "First name is required")
    @Column(name = "first_name", nullable = false, length = 100)
    private String firstName;

    @NotBlank(message = "Last name is required")
    @Column(name = "last_name", nullable = false, length = 100)
    private String lastName;

    /** MM/DD/YYYY */
    @NotBlank(message = "Date of birth is required")
    @Column(name = "dob", nullable = false, length = 10)
    private String dob;

    @Column(name = "phone", length = 20)
    private String phone;

    @Column(name = "email", length = 150)
    private String email;

    @Column(name = "address", length = 300)
    private String address;

    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    // ── Derived helpers (not persisted) ──────────────────────────────────────

    @Transient
    public String getFullName() {
        return firstName + " " + lastName;
    }

    @Transient
    public String getInitials() {
        return (firstName.isEmpty() ? "?" : String.valueOf(firstName.charAt(0)).toUpperCase())
             + (lastName.isEmpty()  ? "?" : String.valueOf(lastName.charAt(0)).toUpperCase());
    }
}
