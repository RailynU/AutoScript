package com.springray.autoscript.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "prescriptions")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Prescription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "rx_id", unique = true, nullable = false, length = 20)
    private String rxId;

    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "patient_id", nullable = false)
    private Patient patient;

    @NotBlank
    @Column(name = "medication", nullable = false, length = 200)
    private String medication;

    @Column(name = "dosage", length = 100)
    private String dosage;

    @Column(name = "instructions", columnDefinition = "TEXT")
    private String instructions;

    /** processing | manual | reviewed | cleared */
    @NotBlank
    @Column(name = "status", nullable = false, length = 20)
    private String status;

    @Column(name = "substatus", length = 200)
    private String substatus;

    @Column(name = "prescriber", length = 150)
    private String prescriber;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) createdAt = LocalDateTime.now();
        if (rxId == null || rxId.isBlank()) rxId = generateRxId();
    }

    private String generateRxId() {
        return "RX-" + (70000 + (int)(Math.random() * 9999));
    }
}
