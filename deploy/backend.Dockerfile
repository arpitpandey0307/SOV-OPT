# Control plane + native solver core + verifier.
FROM python:3.12-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends build-essential cmake ninja-build && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY CMakeLists.txt CMakePresets.json ./
COPY cmake cmake
COPY solver solver
COPY cli cli
COPY tools/emps tools/emps
RUN cmake -S . -B build/release -G Ninja -DCMAKE_BUILD_TYPE=Release -DSOVOPT_BUILD_TESTS=OFF \
 && cmake --build build/release \
 && gcc -O2 -w -o tools/emps/emps tools/emps/emps.c

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend backend
COPY bindings bindings
COPY verifier verifier
COPY models models
COPY --from=build /src/build/release/solver/libsovopt.so build/release/solver/libsovopt.so
COPY --from=build /src/build/release/cli/sovopt build/release/cli/sovopt
COPY --from=build /src/tools/emps/emps tools/emps/emps
ENV SOVOPT_LIB=/app/build/release/solver/libsovopt.so \
    SOVOPT_EMPS_BIN=/app/tools/emps/emps \
    SOVOPT_DATASET_DIR=/app/Dataset \
    PYTHONPATH=/app/bindings/python
EXPOSE 8000
WORKDIR /app/backend
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
