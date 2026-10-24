package com.springray.autoscript.controllers;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

// Controller defines class that handles HTTP Requests
// More suited for returning webpages
@Controller
public class PharmaUICController {

    // HTTP requests mapped to appropriate
    // webpage response 

    @GetMapping("/dashboard")
    public String getDashboard()
    {
        return "dashboard";
    }
    @GetMapping("/queue")
    public String getQueue()
    {
        return "queue";
    }

    @GetMapping("/patientProfile")
    public String getPatientProfile()
    {
        return "patientprofile";
    }


}
