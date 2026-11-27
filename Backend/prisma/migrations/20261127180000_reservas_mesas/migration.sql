BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[mesas] (
    [id] INT NOT NULL IDENTITY(1,1),
    [sucursal_id] INT NOT NULL,
    [numero] NVARCHAR(20) NOT NULL,
    [capacidad] INT NOT NULL,
    [activo] BIT NOT NULL CONSTRAINT [mesas_activo_df] DEFAULT 1,
    [creado_en] DATETIME2 NOT NULL CONSTRAINT [mesas_creado_en_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [mesas_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [mesas_sucursal_id_numero_key] UNIQUE NONCLUSTERED ([sucursal_id],[numero]),
    CONSTRAINT [mesas_id_sucursal_id_key] UNIQUE NONCLUSTERED ([id],[sucursal_id])
);

-- CreateTable
CREATE TABLE [dbo].[reservas] (
    [id] INT NOT NULL IDENTITY(1,1),
    [sucursal_id] INT NOT NULL,
    [mesa_id] INT NOT NULL,
    [usuario_id] INT NOT NULL,
    [cliente_nombre] NVARCHAR(150) NOT NULL,
    [cliente_telefono] VARCHAR(20),
    [personas] INT NOT NULL,
    [inicio] DATETIME2 NOT NULL,
    [fin] DATETIME2 NOT NULL,
    [estado] VARCHAR(15) NOT NULL CONSTRAINT [reservas_estado_df] DEFAULT 'pendiente',
    [notas] NVARCHAR(300),
    [creado_en] DATETIME2 NOT NULL CONSTRAINT [reservas_creado_en_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [reservas_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [reservas_mesa_id_inicio_idx] ON [dbo].[reservas]([mesa_id], [inicio]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [reservas_sucursal_id_inicio_idx] ON [dbo].[reservas]([sucursal_id], [inicio]);

-- AddForeignKey
ALTER TABLE [dbo].[mesas] ADD CONSTRAINT [mesas_sucursal_id_fkey] FOREIGN KEY ([sucursal_id]) REFERENCES [dbo].[sucursales]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[reservas] ADD CONSTRAINT [reservas_sucursal_id_fkey] FOREIGN KEY ([sucursal_id]) REFERENCES [dbo].[sucursales]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[reservas] ADD CONSTRAINT [reservas_mesa_id_sucursal_id_fkey] FOREIGN KEY ([mesa_id], [sucursal_id]) REFERENCES [dbo].[mesas]([id],[sucursal_id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[reservas] ADD CONSTRAINT [reservas_usuario_id_fkey] FOREIGN KEY ([usuario_id]) REFERENCES [dbo].[usuarios]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Reglas que Prisma Schema no representa como restricciones CHECK.
ALTER TABLE [dbo].[mesas] ADD
    CONSTRAINT [mesas_capacidad_ck]
        CHECK ([capacidad] BETWEEN 1 AND 50),
    CONSTRAINT [mesas_numero_ck]
        CHECK (LEN(LTRIM(RTRIM([numero]))) > 0);

ALTER TABLE [dbo].[reservas] ADD
    CONSTRAINT [reservas_personas_ck]
        CHECK ([personas] BETWEEN 1 AND 50),
    CONSTRAINT [reservas_intervalo_ck]
        CHECK ([fin] > [inicio]),
    CONSTRAINT [reservas_estado_ck]
        CHECK ([estado] IN ('pendiente', 'confirmada', 'sentada', 'completada', 'cancelada', 'no_asistio')),
    CONSTRAINT [reservas_cliente_nombre_ck]
        CHECK (LEN(LTRIM(RTRIM([cliente_nombre]))) > 0);

-- El solapamiento entre reservas activas de una misma mesa no se puede expresar como CHECK en SQL Server;
-- lo impide el backend (reserva.service.js) bloqueando la fila de la mesa con UPDLOCK, HOLDLOCK
-- dentro de una transacción Serializable. Este índice cubre esa consulta.
CREATE NONCLUSTERED INDEX [reservas_mesa_estado_intervalo_idx] ON [dbo].[reservas]([mesa_id], [estado], [inicio]) INCLUDE ([fin]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
