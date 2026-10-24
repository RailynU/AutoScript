package com.springray.autoscript.services;

import com.springray.autoscript.dto.ScriptData;
import com.springray.autoscript.model.Script;
import com.springray.autoscript.model.ScriptStatus;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicLong;

@Component
public class ScriptQueue {

    private final AtomicLong idSequence = new AtomicLong();
    private final ConcurrentHashMap<String, Script> scripts = new ConcurrentHashMap<>();
    private final ConcurrentLinkedQueue<String> queuedIds = new ConcurrentLinkedQueue<>();

    public Script add(ScriptData data) {
        String id = String.valueOf(idSequence.incrementAndGet());
        Script script = new Script(id, data);
        scripts.put(id, script);
        queuedIds.add(id);
        return script;
    }

    public synchronized Optional<Script> pull() {
        String id = queuedIds.poll();
        if (id == null) {
            return Optional.empty();
        }
        Script script = scripts.get(id);
        script.markInReview();
        return Optional.of(script);
    }

    public synchronized Optional<Script> pull(String id) {
        if (!queuedIds.remove(id)) {
            return Optional.empty();
        }
        Script script = scripts.get(id);
        script.markInReview();
        return Optional.of(script);
    }

    public void pop(String id) {
        queuedIds.remove(id);
    }

    public void remove(String id) {
        queuedIds.remove(id);
        scripts.remove(id);
    }

    public Optional<Script> find(String id) {
        return Optional.ofNullable(scripts.get(id));
    }

    public List<Script> findByStatus(ScriptStatus status) {
        return scripts.values().stream()
                .filter(script -> script.getStatus() == status)
                .sorted(Comparator.comparing(Script::getSubmittedAt))
                .toList();
    }

    public boolean hasQueued() {
        return !queuedIds.isEmpty();
    }
}
